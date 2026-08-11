using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Service;
using OnlineOD.Services;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class OdApplyController : ControllerBase
    {
        private readonly IOdApplyService _service;
        private readonly IStaffService _staffService;
        private readonly EmailService _emailService;

        public OdApplyController(IOdApplyService service, IStaffService staffService,
            EmailService emailService)
        {
            _service = service;
            _staffService = staffService;
            _emailService = emailService;
        }

        // GET /api/OdApply — all ODs
        [HttpGet]
        public async Task<IActionResult> GetAllOd()
        {
            var od = await _service.GetAllOdApplyAsync();
            return Ok(od);
        }

        // GET /api/OdApply/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetOdById(int id)
        {
            var od = await _service.GetOdApplyByIdAsync(id);
            if (od == null) return NotFound();
            return Ok(od);
        }

        // GET /api/OdApply/Student-Od/{studentId}
        [HttpGet("Student-Od/{studentId}")]
        public async Task<IActionResult> GetByStudentId(int studentId)
        {
            var ods = await _service.GetByStudentIdAsync(studentId);
            return Ok(ods);
        }

        // ── NEW: GET /api/OdApply/ByRegister/{registerNumber}
        // Fix 4: member students look up their OD status by register number
        [HttpGet("ByRegister/{registerNumber}")]
        public async Task<IActionResult> GetByRegisterNumber(string registerNumber)
        {
            var all = await _service.GetAllOdApplyAsync();

            var target = registerNumber.Trim().ToLower();

            // Match ODs where this register number is the applicant OR is listed in RegisterNumbers
            var matched = all.Where(o =>
                (o.registerNumber != null &&
                 o.registerNumber.Trim().ToLower() == target)
                ||
                (o.IsGroupOd && o.RegisterNumbers != null &&
                 o.RegisterNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                  .Any(r => r.ToLower() == target))
            )
            .OrderByDescending(o => o.AppliedDate)
            .ToList();

            var withCerts = await _service.AttachCertificatesAsync(matched);
            return Ok(withCerts);
        }

        // ── NEW: GET /api/OdApply/WithCertificates
        // Fix for faculty certificates view
        [HttpGet("WithCertificates")]
        public async Task<IActionResult> GetWithCertificates()
        {
            var all = await _service.GetAllOdApplyAsync();
            var certs = all.Where(o => !string.IsNullOrEmpty(o.CertificatePhotoUrl))
                           .OrderByDescending(o => o.AppliedDate)
                           .ToList();
            return Ok(certs);
        }

        // POST /api/OdApply/OD-Apply
        [HttpPost("OD-Apply")]
        public async Task<IActionResult> CreateOdApply([FromBody] OdApplyDto dto)
        {
            if (dto == null)
                return BadRequest("OD Apply data is required");

            var result = await _service.CreateOdApplyAsync(dto);

            // Send email to the staff in the SAME department AND section as
            // the applying student — this is what routes a Section-B
            // student's OD only to their Section-B class teacher, instead of
            // every staff member in the department.
            string emailStatus = "not_applicable";
            string emailDetail = null;
            try
            {
                var staffList = await _staffService.GetAllStaffAsync();
                var deptStaff = staffList.Where(s =>
                    s.Department != null &&
                    s.Department.Trim().ToLower() == (dto.department ?? "").Trim().ToLower() &&
                    !string.IsNullOrWhiteSpace(dto.Section) &&
                    s.Section != null &&
                    s.Section.Trim().ToLower() == dto.Section.Trim().ToLower() &&
                    !string.IsNullOrEmpty(s.Email)
                ).ToList();

                if (deptStaff.Count == 0)
                {
                    emailStatus = "failed";
                    emailDetail = string.IsNullOrWhiteSpace(dto.Section)
                        ? "No Section was set on this OD, so no matching staff could be found."
                        : $"No staff found for department '{dto.department}' + section '{dto.Section}' with an Email set.";
                    Console.WriteLine($"[Email] Staff notify skipped — {emailDetail}");
                }
                else
                {
                    foreach (var staff in deptStaff)
                    {
                        await _emailService.SendOdSubmissionEmailAsync(
                            toEmail: staff.Email,
                            staffName: staff.Name,
                            studentName: dto.StudentName ?? "",
                            registerNumber: dto.registerNumber ?? "",
                            eventName: dto.Event ?? "",
                            department: dto.department ?? "",
                            fromDate: dto.FromDate ?? "",
                            toDate: dto.ToDate ?? "",
                            odId: result.OdId,
                            isGroup: dto.IsGroupOd,
                            groupName: dto.GroupName ?? "",
                            registerNumbers: dto.RegisterNumbers ?? "",
                            collegeIndustry: dto.CollegeIndustry ?? ""
                        );
                    }
                    emailStatus = "sent";
                    Console.WriteLine($"[Email] Staff notify sent to {deptStaff.Count} staff for OD #{result.OdId}");
                }
            }
            catch (Exception ex)
            {
                emailStatus = "failed";
                emailDetail = ex.InnerException != null
                    ? $"{ex.Message} | Inner: {ex.InnerException.Message}"
                    : ex.Message;
                Console.WriteLine($"[Email] Staff notify FAILED — {emailDetail}");
            }

            // Surface the email outcome via a response header instead of
            // changing the JSON shape, so nothing that reads `result`'s
            // fields elsewhere breaks.
            Response.Headers["X-Email-Status"] = emailStatus;
            if (!string.IsNullOrEmpty(emailDetail))
                Response.Headers["X-Email-Detail"] = emailDetail;

            return Ok(result);
        }

        // DELETE /api/OdApply/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteOd(int id)
        {
            var result = await _service.DeleteOdApplyAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }

        // PUT /api/OdApply/{odId}/RejectMember?registerNumber=XXX
        [HttpPut("{odId}/RejectMember")]
        public async Task<IActionResult> RejectMember(int odId, [FromQuery] string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var od = await _service.RejectGroupMemberAsync(odId, registerNumber.Trim());
            if (od == null) return NotFound("OD request not found");
            return Ok(od);
        }

        // PUT /api/OdApply/{odId}/UnrejectMember?registerNumber=XXX
        // Faculty undoing their own rejection
        [HttpPut("{odId}/UnrejectMember")]
        public async Task<IActionResult> UnrejectMember(int odId, [FromQuery] string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var od = await _service.UnrejectGroupMemberAsync(odId, registerNumber.Trim());
            if (od == null) return NotFound("OD request not found");
            return Ok(od);
        }

        // PUT /api/OdApply/{odId}/HodOverrideMember?registerNumber=XXX
        // HOD approving a member that faculty rejected
        [HttpPut("{odId}/HodOverrideMember")]
        public async Task<IActionResult> HodOverrideMember(int odId, [FromQuery] string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var od = await _service.HodOverrideGroupMemberAsync(odId, registerNumber.Trim());
            if (od == null) return NotFound("OD request not found");
            return Ok(od);
        }


        // DELETE /api/OdApply/{odId}
        [HttpDelete("{odId}")]
        public async Task<IActionResult> DeleteOdApply(int odId)
        {
            var result = await _service.DeleteOdApplyAsync(odId);
            if (!result) return NotFound();
            return Ok(result);
        }

        // POST /api/OdApply/{odId}/UploadCertificate
        // Each student (identified by registerNumber) gets their own certificate
        // row for this OD — required for group ODs where multiple members each
        // upload their own certificate without overwriting each other's.
        [HttpPost("{odId}/UploadCertificate")]
        public async Task<IActionResult> UploadCertificate(int odId,
            [FromForm] string winningStatus,
            [FromForm] string registerNumber,
            IFormFile photo)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var od = await _service.GetOdApplyByIdAsync(odId);
            if (od == null) return NotFound();

            var existingCerts = await _service.GetCertificatesForOdAsync(odId);
            var mine = existingCerts.FirstOrDefault(c =>
                c.RegisterNumber.Equals(registerNumber.Trim(), StringComparison.OrdinalIgnoreCase));

            if (mine != null && mine.CertificateVerified)
                return BadRequest("This certificate has already been verified by staff and can no longer be changed.");

            var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");
            Directory.CreateDirectory(uploadsDir);
            var fileName = $"{odId}_{registerNumber.Trim()}_{Guid.NewGuid()}{Path.GetExtension(photo.FileName)}";
            var filePath = Path.Combine(uploadsDir, fileName);
            using var stream = System.IO.File.Create(filePath);
            await photo.CopyToAsync(stream);

            var certUrl = $"/uploads/{fileName}";
            var cert = await _service.UploadMemberCertificateAsync(odId, registerNumber.Trim(), winningStatus, certUrl);

            return Ok(cert);
        }

        // GET /api/OdApply/{odId}/Certificates
        // Returns every group member's certificate for this OD (one entry per
        // register number who has uploaded so far).
        [HttpGet("{odId}/Certificates")]
        public async Task<IActionResult> GetCertificates(int odId)
        {
            var certs = await _service.GetCertificatesForOdAsync(odId);
            return Ok(certs);
        }

        // PUT /api/OdApply/{odId}/VerifyCertificate?registerNumber=XXX
        // Staff verifies ONE specific member's certificate — once verified,
        // that student (and only that student) can no longer replace it.
        [HttpPut("{odId}/VerifyCertificate")]
        public async Task<IActionResult> VerifyCertificate(int odId, [FromQuery] string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var cert = await _service.VerifyMemberCertificateAsync(odId, registerNumber.Trim());
            if (cert == null) return NotFound("Certificate not found for this student on this OD");

            return Ok(cert);
        }
    }
}
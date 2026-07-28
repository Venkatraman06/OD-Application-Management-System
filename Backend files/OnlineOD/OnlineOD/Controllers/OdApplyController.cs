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

            // Match ODs where this register number is the applicant OR is listed in GroupName
            var matched = all.Where(o =>
                (o.registerNumber != null &&
                 o.registerNumber.Trim().ToLower() == registerNumber.Trim().ToLower())
                ||
                (o.IsGroupOd && o.GroupName != null &&
                 o.GroupName.ToLower().Contains(registerNumber.Trim().ToLower()))
            )
            .OrderByDescending(o => o.AppliedDate)
            .ToList();

            return Ok(matched);
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

            // Send email to ALL faculty in same department
            try
            {
                var staffList = await _staffService.GetAllStaffAsync();
                var deptStaff = staffList.Where(s =>
                    s.Department != null &&
                    s.Department.Trim().ToLower() == (dto.department ?? "").Trim().ToLower() &&
                    !string.IsNullOrEmpty(s.Email)
                ).ToList();

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
                        groupName: dto.GroupName ?? ""
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Email error: {ex.Message}");
            }

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

        // POST /api/OdApply/{odId}/UploadCertificate
        [HttpPost("{odId}/UploadCertificate")]
        public async Task<IActionResult> UploadCertificate(int odId,
            [FromForm] string winningStatus,
            IFormFile photo)
        {
            var od = await _service.GetOdApplyByIdAsync(odId);
            if (od == null) return NotFound();

            var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");
            Directory.CreateDirectory(uploadsDir);
            var fileName = $"{odId}_{Guid.NewGuid()}{Path.GetExtension(photo.FileName)}";
            var filePath = Path.Combine(uploadsDir, fileName);
            using var stream = System.IO.File.Create(filePath);
            await photo.CopyToAsync(stream);

            od.WinningStatus = winningStatus;
            od.CertificatePhotoUrl = $"/uploads/{fileName}";
            await _service.UpdateCertificateAsync(od);

            return Ok(new { url = od.CertificatePhotoUrl });
        }
    }
}
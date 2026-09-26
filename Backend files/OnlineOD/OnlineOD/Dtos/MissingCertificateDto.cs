namespace OnlineOD.Dtos
{
    public class MissingCertificateDto
    {
        public int OdId { get; set; }
        public string RegisterNumber { get; set; } = "";
        public string? StudentName { get; set; }
        public string? EventName { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public string? CollegeName { get; set; }
        public bool IsGroupOd { get; set; }
        public string? GroupName { get; set; }
    }
}

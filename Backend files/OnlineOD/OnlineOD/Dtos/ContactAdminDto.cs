namespace OnlineOD.Dtos
{
    // Payload sent from the "Contact Admin" form on the login page.
    public class ContactAdminDto
    {
        public string RegisterNumber { get; set; }
        public string Dob { get; set; }        // Date of Birth, as typed (yyyy-MM-dd from <input type=date>)
        public string Password { get; set; }
        public string Role { get; set; }        // "Student" | "Staff" | "HOD"
        public string Message { get; set; }      // the report / issue box
    }
}
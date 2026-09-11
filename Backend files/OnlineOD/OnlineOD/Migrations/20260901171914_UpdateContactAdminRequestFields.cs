using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class UpdateContactAdminRequestFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Email",
                table: "ContactAdminRequests");

            migrationBuilder.RenameColumn(
                name: "Subject",
                table: "ContactAdminRequests",
                newName: "Role");

            migrationBuilder.RenameColumn(
                name: "PhoneNumber",
                table: "ContactAdminRequests",
                newName: "Dob");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "ContactAdminRequests",
                newName: "RegisterNumber");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Role",
                table: "ContactAdminRequests",
                newName: "Subject");

            migrationBuilder.RenameColumn(
                name: "RegisterNumber",
                table: "ContactAdminRequests",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "Dob",
                table: "ContactAdminRequests",
                newName: "PhoneNumber");

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "ContactAdminRequests",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }
    }
}

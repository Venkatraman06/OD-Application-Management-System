using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class AddOdApplyNewFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "password",
                table: "Staffs",
                newName: "Password");

            migrationBuilder.RenameColumn(
                name: "password",
                table: "Hods",
                newName: "Password");

            migrationBuilder.AddColumn<string>(
                name: "Department",
                table: "Staffs",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Department",
                table: "Staffs");

            migrationBuilder.RenameColumn(
                name: "Password",
                table: "Staffs",
                newName: "password");

            migrationBuilder.RenameColumn(
                name: "Password",
                table: "Hods",
                newName: "password");
        }
    }
}

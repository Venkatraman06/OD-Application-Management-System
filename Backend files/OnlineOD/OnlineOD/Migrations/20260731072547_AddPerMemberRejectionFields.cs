using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class AddPerMemberRejectionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FacultyRejectedRegisterNumbers",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HodApprovedRegisterNumbers",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FacultyRejectedRegisterNumbers",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "HodApprovedRegisterNumbers",
                table: "OdApplies");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class AddRegisterNumbersToOdApply : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RegisterNumbers",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RegisterNumbers",
                table: "OdApplies");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class AddDateEditedTrackingToOdApply : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DateEditedBy",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDateEdited",
                table: "OdApplies",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "OriginalEndTime",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OriginalFromDate",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OriginalStartTime",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OriginalToDate",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DateEditedBy",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "IsDateEdited",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "OriginalEndTime",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "OriginalFromDate",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "OriginalStartTime",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "OriginalToDate",
                table: "OdApplies");
        }
    }
}

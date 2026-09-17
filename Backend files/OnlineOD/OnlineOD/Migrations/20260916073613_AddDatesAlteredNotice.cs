using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class AddDatesAlteredNotice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DatesAlteredByStaff",
                table: "OdApplies",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DatesAlteredAt",
                table: "OdApplies",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviousFromDate",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviousToDate",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviousStartTime",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PreviousEndTime",
                table: "OdApplies",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DatesAlteredByStaff",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "DatesAlteredAt",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "PreviousFromDate",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "PreviousToDate",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "PreviousStartTime",
                table: "OdApplies");

            migrationBuilder.DropColumn(
                name: "PreviousEndTime",
                table: "OdApplies");
        }
    }
}
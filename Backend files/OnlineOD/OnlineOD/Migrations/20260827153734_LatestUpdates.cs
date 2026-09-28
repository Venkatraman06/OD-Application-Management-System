using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class LatestUpdates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
        IF COL_LENGTH('OdApplies', 'CompetitionType') IS NULL
            ALTER TABLE [OdApplies] ADD [CompetitionType] nvarchar(max) NULL;");
        }
        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompetitionType",
                table: "OdApplies");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OnlineOD.Migrations
{
    /// <inheritdoc />
    public partial class AddOdCertificatesTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OdCertificates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OdId = table.Column<int>(type: "int", nullable: false),
                    RegisterNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WinningStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CertificatePhotoUrl = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CertificateVerified = table.Column<bool>(type: "bit", nullable: false),
                    UploadedDate = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OdCertificates", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OdCertificates");
        }
    }
}

# OD-Application-Management-System
A full-stack web application for managing student On-Duty (OD) requests 
in a college environment. Built with ASP.NET Core Web API backend and 
HTML/CSS/JavaScript frontend.

## Features
- Student can apply for OD requests with event details and date range
- 3-level approval workflow: Student → Faculty → HOD
- Faculty receives Gmail notification when a student submits an OD
- HOD receives Gmail notification when faculty approves an OD
- Real-time OD status tracking for students
- OD records (History) will be saved
- Department-based filtering for faculty and HOD
- Search approved/rejected ODs by register number
- JWT-ready architecture with clean service layer

## Tech Stack
**Backend:** ASP.NET Core Web API, Entity Framework Core, SQL Server, MailKit  
**Frontend:** HTML, CSS, JavaScript, Fetch API  
**Database:** SQL Server (LocalDB)  
**Email:** Gmail SMTP via MailKit  

## Workflow
1. Student submits OD request → Faculty gets Gmail notification
2. Faculty approves → HOD gets Gmail notification  
3. HOD gives final approval → OD fully approved
4. Student can track status at every stage

## Setup
1. Clone the repository
2. Update connection string in `appsettings.json`
3. Add Gmail credentials in `EmailSettings` section
4. Run SQL migrations or use provided SQL scripts
5. Run backend with `dotnet run`
6. Open frontend with Live Server

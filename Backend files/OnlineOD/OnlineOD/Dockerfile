# ============================================
# Stage 1: Base Runtime Environment
# ============================================
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080
EXPOSE 5088

# ============================================
# Stage 2: Build & Restore Dependencies
# ============================================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project file and restore as distinct layer
COPY ["OnlineOD.csproj", "./"]
RUN dotnet restore "OnlineOD.csproj"

# Copy all source files and build
COPY . .
WORKDIR "/src"
RUN dotnet build "OnlineOD.csproj" -c Release -o /app/build

# ============================================
# Stage 3: Publish Application
# ============================================
FROM build AS publish
RUN dotnet publish "OnlineOD.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ============================================
# Stage 4: Final Production Image
# ============================================
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .

# Ensure wwwroot/uploads directory exists for runtime certificate storage
RUN mkdir -p wwwroot/uploads

ENTRYPOINT ["dotnet", "OnlineOD.dll"]

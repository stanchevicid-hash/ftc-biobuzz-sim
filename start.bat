@echo off
rem FTC BIOBUZZ simulator: builds the simulated FTC SDK + Java bridge (first run or "start.bat --rebuild")
rem and starts the local server at http://localhost:8740/
setlocal
cd /d "%~dp0"
set PORT=8740
where java >nul 2>nul || (echo Java not found. Install Java 8+ ^(Android Studio already contains one: add its jbr\bin to PATH^). & pause & exit /b 1)
if "%~1"=="--rebuild" goto rebuild
if "%~1"=="--build-only" (call :build & exit /b %errorlevel%)
if not exist build\server\ftcsim\server\SimServer.class goto rebuild
goto run

:rebuild
call :build || (pause & exit /b 1)

:run
start "" http://localhost:%PORT%/
java -cp "build\sdk;build\server;server\lib\ecj.jar" ftcsim.server.SimServer . %PORT%
exit /b

:build
echo Building simulated FTC SDK...
if exist build rmdir /s /q build
mkdir build\sdk build\server
for /r sdk\src %%f in (*.java) do @echo "%%f">>build\sdk-files.txt
java -jar server\lib\ecj.jar -1.8 -nowarn -g -encoding UTF-8 -d build\sdk @build\sdk-files.txt || exit /b 1
for /r server\src %%f in (*.java) do @echo "%%f">>build\server-files.txt
java -jar server\lib\ecj.jar -1.8 -nowarn -g -encoding UTF-8 -cp "build\sdk;server\lib\ecj.jar" -d build\server @build\server-files.txt || exit /b 1
echo Build OK.
exit /b 0

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = "dist";
const PROJECT_NAME = "toolZL-webapp";
const VERSION = JSON.parse(fs.readFileSync("package.json", "utf8")).version || "1.0.0";

// Files and directories to copy
const FILES_TO_COPY = [
  "src",
  "public",
  "package.json",
  "README.md",
];

// Files and directories to ignore
const IGNORE_PATTERNS = [
  "node_modules",
  "logs",
  "uploads",
  "dist",
  "build",
  ".git",
  ".gitignore",
  "qr_*.png",
  "*.log",
  ".env",
  "build.js",
  "index.js",
];

/**
 * Check if a file/directory should be ignored
 */
function shouldIgnore(filePath) {
  const fileName = path.basename(filePath);
  const relativePath = path.relative(__dirname, filePath);
  
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\*/g, ".*"));
      return regex.test(fileName);
    }
    
    // Special handling for index.js - only ignore root level index.js
    if (pattern === "index.js") {
      return relativePath === "index.js";
    }
    
    // Special handling for "uploads" - only ignore root level uploads directory
    if (pattern === "uploads") {
      return relativePath === "uploads" || relativePath.startsWith("uploads" + path.sep);
    }
    
    return fileName === pattern || filePath.includes(pattern);
  });
}

/**
 * Copy file or directory recursively
 */
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (shouldIgnore(src)) {
      return;
    }
    
    // Create destination directory
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Copy contents
    const files = fs.readdirSync(src);
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      
      if (!shouldIgnore(srcPath)) {
        copyRecursive(srcPath, destPath);
      }
    }
  } else {
    if (shouldIgnore(src)) {
      return;
    }
    
    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(src, dest);
  }
}

/**
 * Clean build directory
 */
function cleanBuildDir() {
  if (fs.existsSync(BUILD_DIR)) {
    console.log(`🧹 Cleaning ${BUILD_DIR}...`);
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/**
 * Copy files to build directory
 */
function copyFiles() {
  console.log("📦 Copying files...");
  
  for (const item of FILES_TO_COPY) {
    const srcPath = path.join(__dirname, item);
    const destPath = path.join(__dirname, BUILD_DIR, item);
    
    if (fs.existsSync(srcPath)) {
      console.log(`  ✓ Copying ${item}...`);
      copyRecursive(srcPath, destPath);
    } else {
      console.warn(`  ⚠ Warning: ${item} not found, skipping...`);
    }
  }
}

/**
 * Install production dependencies
 */
function installDependencies() {
  console.log("📥 Installing production dependencies...");
  
  const buildPackageJson = path.join(__dirname, BUILD_DIR, "package.json");
  const originalPackageJson = JSON.parse(fs.readFileSync(buildPackageJson, "utf8"));
  
  // Remove devDependencies from build package.json
  const buildPackage = {
    ...originalPackageJson,
    devDependencies: undefined,
  };
  
  fs.writeFileSync(buildPackageJson, JSON.stringify(buildPackage, null, 2));
  
  // Install dependencies
  try {
    process.chdir(BUILD_DIR);
    console.log("  Running npm install --production...");
    execSync("npm install --production", { stdio: "inherit" });
    process.chdir(__dirname);
    console.log("  ✓ Dependencies installed");
  } catch (error) {
    process.chdir(__dirname);
    console.error("  ✗ Failed to install dependencies:", error.message);
    throw error;
  }
}

/**
 * Create start scripts
 */
function createStartScripts() {
  console.log("📝 Creating start scripts...");
  
  const buildDir = path.join(__dirname, BUILD_DIR);
  
  // Windows start.bat
  const startBat = `@echo off
echo Starting ToolZL Webapp...
echo.

REM Set environment variables (can be overridden by setting them before running this script)
REM To allow access from other devices on network, HOST is set to 0.0.0.0 by default
REM To restrict to localhost only, set HOST=localhost before running
if "%HOST%"=="" set HOST=0.0.0.0
if "%PORT%"=="" set PORT=3000
if "%NODE_ENV%"=="" set NODE_ENV=production

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Start server
echo Starting server on http://%HOST%:%PORT%...
if "%HOST%"=="0.0.0.0" (
    echo.
    echo Server is accessible from network!
    echo Access from other devices: http://YOUR_IP_ADDRESS:%PORT%
    echo To find your IP address, run: ipconfig
) else (
    echo Server is only accessible from this computer (localhost)
)
echo.
node src/server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server stopped with error code %ERRORLEVEL%
    pause
)
`;
  
  fs.writeFileSync(path.join(buildDir, "start.bat"), startBat);
  console.log("  ✓ Created start.bat");
  
  // Linux/Mac start.sh
  const startSh = `#!/bin/bash

echo "Starting ToolZL Webapp..."
echo ""

# Set environment variables (can be overridden by .env file)
export PORT=\${PORT:-3000}
export HOST=\${HOST:-0.0.0.0}
export NODE_ENV=\${NODE_ENV:-production}

# Load .env file if it exists
if [ -f .env ]; then
    echo "Loading .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Start server
echo "Starting server on http://$HOST:$PORT..."
echo "Access from other devices: http://YOUR_IP_ADDRESS:$PORT"
echo ""
node src/server.js

if [ $? -ne 0 ]; then
    echo ""
    echo "Server stopped with error"
    exit 1
fi
`;
  
  fs.writeFileSync(path.join(buildDir, "start.sh"), startSh);
  
  // Make start.sh executable (Unix-like systems)
  try {
    fs.chmodSync(path.join(buildDir, "start.sh"), 0o755);
  } catch (error) {
    // Ignore on Windows
  }
  
  console.log("  ✓ Created start.sh");
}

/**
 * Create .env.example file
 */
function createEnvExample() {
  console.log("📝 Creating .env.example...");
  
  const envExample = `# ToolZL Webapp Configuration
# Copy this file to .env and update the values as needed

# Server Port (default: 3000)
PORT=3000

# Server Host
# - Use "0.0.0.0" to allow access from network (other devices on same network) - RECOMMENDED
# - Use "localhost" for local access only (more secure, but cannot access from other devices)
# Default in start scripts: 0.0.0.0 (allows network access)
HOST=0.0.0.0

# Node Environment
# - "development" for development mode
# - "production" for production mode
NODE_ENV=production
`;
  
  fs.writeFileSync(path.join(__dirname, BUILD_DIR, ".env.example"), envExample);
  console.log("  ✓ Created .env.example");
}

/**
 * Create archive (zip)
 */
function createArchive() {
  return new Promise((resolve, reject) => {
    console.log("📦 Creating archive...");
    
    const archiveName = `${PROJECT_NAME}-v${VERSION}.zip`;
    const archivePath = path.join(__dirname, archiveName);
    
    // Remove existing archive if exists
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    
    const output = fs.createWriteStream(archivePath);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Maximum compression
    });
    
    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`  ✓ Archive created: ${archiveName} (${sizeMB} MB)`);
      resolve(archivePath);
    });
    
    archive.on("error", (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    // Add build directory to archive
    archive.directory(BUILD_DIR, false);
    
    archive.finalize();
  });
}

/**
 * Main build function
 */
async function build() {
  try {
    console.log("🚀 Starting build process...");
    console.log(`📦 Building ${PROJECT_NAME} v${VERSION}\n`);
    
    // Step 1: Clean build directory
    cleanBuildDir();
    
    // Step 2: Copy files
    copyFiles();
    
    // Step 3: Create start scripts
    createStartScripts();
    
    // Step 4: Create .env.example
    createEnvExample();
    
    // Step 5: Install production dependencies
    installDependencies();
    
    // Step 6: Create archive
    const createZip = process.argv.includes("--zip") || process.argv.includes("-z");
    if (createZip) {
      await createArchive();
    }
    
    console.log("\n✅ Build completed successfully!");
    console.log(`📁 Build output: ${BUILD_DIR}/`);
    if (createZip) {
      console.log(`📦 Archive: ${PROJECT_NAME}-v${VERSION}.zip`);
    }
    console.log("\nTo start the application:");
    console.log("  Windows: cd dist && start.bat");
    console.log("  Linux/Mac: cd dist && ./start.sh");
    
  } catch (error) {
    console.error("\n❌ Build failed:", error.message);
    process.exit(1);
  }
}

// Run build
build();


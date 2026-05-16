const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            results.push(file);
        }
    });
    return results;
}

const projectPath = 'C:\\Users\\sidha\\.gemini\\antigravity\\scratch\\askexpert';
const projectPathEscaped = projectPath.replace(/\\/g, '\\\\');

console.log('Starting path fix process...');

const files = walk('.netlify');
for (const file of files) {
    if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs') || file.endsWith('.json')) {
        let content;
        try {
            content = fs.readFileSync(file, 'utf8');
        } catch (e) {
            continue;
        }
        const originalContent = content;
        
        // 1. Fix the malformed \var\task and tabs
        content = content.replace(/\x0Bar\x09ask/g, '/var/task');
        content = content.replace(/\\var\\task/g, '/var/task');
        content = content.replace(/\\var\/task/g, '/var/task');
        content = content.replace(/\/var\\task/g, '/var/task');
        
        // 2. Replace any absolute local paths with /var/task
        const normalPath = projectPath.replace(/\\/g, '/');
        const lowerPath = normalPath.charAt(0).toLowerCase() + normalPath.slice(1);
        
        content = content.split(projectPath).join('/var/task');
        content = content.split(projectPathEscaped).join('/var/task');
        content = content.split(normalPath).join('/var/task');
        content = content.split(lowerPath).join('/var/task');

        // 2.5 Special case: /var/task followed by the relative part of the local path
        const localPathSuffix = '.gemini/antigravity/scratch/askexpert';
        content = content.split('/var/task/' + localPathSuffix).join('/var/task');
        content = content.split('/var/task' + localPathSuffix).join('/var/task');

        // 3. Fix all remaining backslashes in /var/task paths
        content = content.replace(/\/var\/task[\w\.\/\-\\]+/g, (match) => {
            return match.replace(/\\/g, '/').replace(/\/+/g, '/');
        });

        // 4. Specifically fix manifest.json paths to be relative for netlify-cli
        if (file.endsWith('manifest.json')) {
            content = content.replace(/\/var\/task\//g, './');
        }

        if (content !== originalContent) {
            fs.writeFileSync(file, content);
            console.log(`Fixed paths in ${file}`);
        }
    }
}

// Re-zip the functions
const functionsDir = '.netlify/functions-internal/___netlify-server-handler';
const zipPath = '.netlify/functions/___netlify-server-handler.zip';

if (fs.existsSync(functionsDir)) {
    console.log(`Re-zipping ${functionsDir} to ${zipPath}...`);
    
    // Ensure destination directory exists
    const destDir = path.dirname(zipPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Delete existing zip if it exists
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    try {
        // Use PowerShell to zip the contents
        // We need to change directory to the functionsDir so the zip doesn't contain the full path
        const absoluteFunctionsDir = path.resolve(functionsDir);
        const absoluteZipPath = path.resolve(zipPath);
        
        execSync(`powershell -Command "Set-Location '${absoluteFunctionsDir}'; Compress-Archive -Path * -DestinationPath '${absoluteZipPath}'"`, { stdio: 'inherit' });
        console.log('Successfully re-zipped function.');
    } catch (e) {
        console.error('Failed to re-zip function:', e.message);
    }
}

// Cleanup: remove any remaining .gemini or .claude folders in the build
const walkCleanup = (d) => {
    if (!fs.existsSync(d)) return;
    let entries;
    try {
        entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (e) {
        return;
    }
    for (const entry of entries) {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.gemini' || entry.name === '.claude') {
                console.log(`Removing unwanted directory: ${fullPath}`);
                try {
                    fs.rmSync(fullPath, { recursive: true, force: true });
                } catch (e) {}
            } else {
                walkCleanup(fullPath);
            }
        }
    }
};

walkCleanup('.netlify');

console.log('Path fix process completed.');

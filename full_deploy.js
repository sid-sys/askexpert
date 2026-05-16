const { execSync } = require('child_process');

function run(cmd) {
    console.log(`Running: ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
        console.error(`Failed: ${cmd}`);
        process.exit(1);
    }
}

console.log('Cleaning up old build artifacts...');
try {
    execSync('powershell -Command "if (Test-Path .next) { Remove-Item -Recurse -Force .next }"');
} catch (e) {}

run('npx netlify-cli build');
run('node fix_netlify_paths.js');
run('npx netlify-cli deploy --prod --no-build --dir=.netlify/static');

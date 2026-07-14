const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx')) results.push(file);
        }
    });
    return results;
}

const files = walk('./components');
let totalModified = 0;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // Convert sharp borders to rounded
    content = content.replace(/className="([^"]*bg-canvas[^"]*border border-hairline[^"]*)"/g, (match, p1) => {
        if (!p1.includes('rounded')) {
            return `className="${p1} rounded-2xl overflow-hidden"`;
        }
        return match;
    });

    content = content.replace(/className="([^"]*bg-card-(navy|emerald|ruby|teal|gold)[^"]*)"/g, (match, p1) => {
        if (!p1.includes('rounded')) {
            return `className="${p1} rounded-2xl overflow-hidden"`;
        }
        return match;
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        totalModified++;
        console.log('Modified:', file);
    }
});

console.log('Total files modified for rounded edges:', totalModified);

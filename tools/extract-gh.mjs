import fs from "fs";
const s = fs.readFileSync("public/dist/app.min.js", "utf8");
const start = s.indexOf("function Gh(");
const end = s.indexOf("function Va(", start);
console.log(s.slice(start, end));

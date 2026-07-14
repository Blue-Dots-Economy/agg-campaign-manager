import { parseSeekersCsv } from "./src/lib/upSeekersCsv";

const csv = `id,user_id,name,location,role,recommended action,applications,shortlisted,rejected,profile completion,follow up for,created_on,profile age,last applied age,status,test
1,u1,Alice,Delhi,Role1,,0,0,0,100%,,1/1/2026,10,5,Active,0
2,u2,Bob,Mumbai,Role2,,1,0,0,80%,,1/1/2026,20,15,Inactive,1
3,u3,Carol,Chennai,Role3,,0,0,0,60%,,1/1/2026,5,2,New,TRUE
4,u4,David,Kolkata,Role4,,2,1,0,90%,,1/1/2026,30,20,Active,false
5,u5,Eve,Hyderabad,Role5,,0,0,0,70%,,1/1/2026,15,10,At Risk,1.0`;

const seekers = parseSeekersCsv(csv);
console.log("Parsed", seekers.length, "seekers (expected 2: Alice and David)");
console.log(seekers.map(s => ({ id: s.id, name: s.name })));

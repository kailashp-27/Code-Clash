// test-judge0.js
const url = "http://localhost:2358/submissions?base64_encoded=false&wait=true";

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    source_code: "print('Hello World from Judge0!')",
    language_id: 71 // 71 represents Python 3
  })
})
  .then(res => res.json())
  .then(data => {
    console.log("Judge0 Raw Response:", data);
    if (data.status && data.status.id === 3) {
      console.log("\n✅ SUCCESS! Status: Accepted.");
      console.log("📝 Stdout:", data.stdout);
    } else {
      console.error("\n❌ FAILED! Status:", data.status?.description);
      console.error("Compile Output:", data.compile_output);
      console.error("Message:", data.message);
    }
  })
  .catch(err => console.error("Error connecting to Judge0 API:", err));

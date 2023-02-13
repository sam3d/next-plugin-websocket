import execa from "execa";

test("make a temporary directory", async () => {
  const { stdout: tempDir } = await execa("mktemp", ["-d"]);
  console.log(tempDir);
});

import execa from "execa";

type NpmPackOutput = {
  id: string;
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  shasum: string;
  integrity: string;
  filename: string;
  files: NpmPackOutputFile[];
  entryCount: number;
  bundled: any[];
};

type NpmPackOutputFile = {
  path: string;
  size: number;
  mode: number;
};

async function runNpmPack() {
  const { stdout: outputDir } = await execa("mktemp", ["-d"]);

  const { stdout } = await execa("npm", [
    "pack",
    "--json",
    "--pack-destination",
    outputDir,
  ]);

  const output = JSON.parse(stdout)[0] as NpmPackOutput;

  return { outputDir, ...output };
}

test("Next.js 13.1 with Yarn and app directory", async () => {
  const packOutput = await runNpmPack();
  console.log(packOutput);
});

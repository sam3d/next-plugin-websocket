import execa from "execa";
import fs from "fs/promises";
import path from "path";

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

const makeTempDir = async () => (await execa("mktemp", ["-d"])).stdout;

async function runNpmPack() {
  const outputDir = await makeTempDir();

  const { stdout } = await execa("npm", [
    "pack",
    "--json",
    "--pack-destination",
    outputDir,
  ]);

  const output = JSON.parse(stdout)[0] as NpmPackOutput;

  return { outputDir, ...output };
}

test(
  "Next.js 13.1 with Yarn and app directory",
  async () => {
    // Generate the npm package tarball
    const packOutput = await runNpmPack();

    // Copy the template over to a temporary directory
    const tempDir = await makeTempDir();
    console.log(tempDir);

    await fs.cp(path.resolve(__dirname, "./template"), tempDir, {
      recursive: true,
    });

    // Install the right version of Next.js and the plugin
    await execa(
      "yarn",
      [
        "add",
        "next@^13.1",
        path.resolve(packOutput.outputDir, packOutput.filename),
      ],
      { cwd: tempDir, stdio: "inherit" }
    );

    // Start the Next.js dev server
    const res = execa("yarn", ["dev"], {
      cwd: tempDir,
      detached: true,
      stdio: "inherit",
    });

    await new Promise((resolve) => setTimeout(resolve, 5000));
    res.kill();
  },
  1000 * 60 * 5
);

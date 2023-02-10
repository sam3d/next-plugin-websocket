import generate from "@babel/generator";
import * as parser from "@babel/parser";
import template from "@babel/template";
import * as t from "@babel/types";
import fs from "fs/promises";

async function main() {
  const filePath = require.resolve("next/dist/server/next-server");
  const content = await fs.readFile(filePath, "utf-8");
  const ast = parser.parse(content);

  const classDeclaration = ast.program.body.find(
    (node): node is t.ClassDeclaration =>
      node.type === "ClassDeclaration" && node.id.name === "NextNodeServer"
  );
  if (!classDeclaration) return;

  const constructorMethod = classDeclaration.body.body.find(
    (node): node is t.ClassMethod =>
      node.type === "ClassMethod" && node.kind === "constructor"
  );
  if (!constructorMethod) return;

  constructorMethod.body.body.push(
    template.statement.ast`require("next-plugin-websocket")._hook.call(this)`
  );

  await fs.writeFile(filePath, generate(ast).code);
}

main();

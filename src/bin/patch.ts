import generate from "@babel/generator";
import * as parser from "@babel/parser";
import template from "@babel/template";
import * as t from "@babel/types";
import fs from "fs/promises";

async function main() {
  await patchNextNodeServer();
  await patchWebpackConfig();
}
main();

async function patchNextNodeServer() {
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

async function patchWebpackConfig() {
  const filePath = require.resolve("next/dist/build/webpack-config");
  const content = await fs.readFile(filePath, "utf-8");
  const ast = parser.parse(content);

  const functionDeclaration = ast.program.body.find(
    (node): node is t.FunctionDeclaration =>
      node.type === "FunctionDeclaration" &&
      node.id?.name === "getBaseWebpackConfig"
  );
  if (!functionDeclaration) return;

  const returnStatementIndex = functionDeclaration.body.body.findIndex(
    (node): node is t.ReturnStatement => node.type === "ReturnStatement"
  );
  if (returnStatementIndex === -1) return;

  functionDeclaration.body.body.splice(
    returnStatementIndex,
    0,
    template.statement
      .ast`webpackConfig.plugins.push(new (require("next-plugin-websocket").WebpackNextWebSocketPlugin)())`
  );

  await fs.writeFile(filePath, generate(ast).code);
}

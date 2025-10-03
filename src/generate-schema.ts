import ts from "typescript";
import openapiTS, { astToString } from "openapi-typescript";
import type { OpenAPI3, SchemaObject, TransformObject } from "openapi-typescript";
import { Readable } from "stream";

const DATE = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Date"));
const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());

function getTypeIdPrefix(schemaObject: SchemaObject) {
	if (!("format" in schemaObject)) {
		return null;
	}
	if (!("x-typeid-prefix" in schemaObject)) {
		return null;
	}

	return schemaObject["x-typeid-prefix"];
}

export async function generateSchema(schemaUrl: string | URL | OpenAPI3 | Buffer | Readable) {
	const ast = await openapiTS(schemaUrl, {
		transform(schemaObject: SchemaObject): ts.TypeNode | TransformObject | undefined {
			switch (schemaObject.format) {
				case "date-time":
					return schemaObject.nullable
						? ts.factory.createUnionTypeNode([DATE, NULL])
						: DATE;

				case "typeid":
					const typeIdPrefix = getTypeIdPrefix(schemaObject);
					if (!typeIdPrefix) {
						return undefined;
					}

					const typeIdType = ts.factory.createTypeReferenceNode(
						ts.factory.createIdentifier("TypeId"),
						[
							ts.factory.createLiteralTypeNode(
								ts.factory.createStringLiteral(typeIdPrefix)
							)
						]
					);
					return typeIdType;

				default:
					return undefined;
			}
		},
		inject: "import { TypeId } from 'typeid-js';",
	});
	return astToString(ast);
}

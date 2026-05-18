export interface OpenAPISchema {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  enum?: (string | number)[];
  items?: OpenAPISchema;
  $ref?: string;
  nullable?: boolean;
  format?: string;
  anyOf?: OpenAPISchema[];
  'x-typeid-prefix'?: string;
  'x-enum-descriptions'?: string[];
}

export interface OpenAPIOperation {
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: string;
    schema?: OpenAPISchema;
  }>;
  requestBody?: {
    content?: {
      'application/json'?: { schema?: OpenAPISchema };
    };
  };
  responses?: Record<string, {
    content?: Record<string, { schema?: OpenAPISchema }>;
  }>;
}

export interface OpenAPISpec {
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
  paths?: Record<string, Record<string, OpenAPIOperation>>;
}

function toPascalCase(segment: string): string {
  return segment.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

export function generatePathName(pathString: string): string {
  return pathString
    .split('/')
    .filter(segment => segment.length > 0 && segment !== 'v1')
    .map(segment => {
      if (segment.startsWith('{') && segment.endsWith('}')) {
        return 'By' + toPascalCase(segment.slice(1, -1));
      }
      return toPascalCase(segment);
    })
    .join('');
}

export function toUpperSnakeCase(name: string): string {
  return name
    .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, '$1_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/__+/g, '_')
    .replace(/_+$/, '');
}

export function toTypeName(schemaName: string): string {
  let name = schemaName.replace(/_+$/, '');
  name = name.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase()).replace(/-/g, '');
  name = name.replace(/^BulkOperationResponse_/, '');

  if (name.includes('__')) {
    const parts = name.split('__');
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^[A-Z][a-zA-Z0-9]*$/.test(parts[i])) {
        name = parts[i];
        break;
      }
    }
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      name = parts[parts.length - 1];
    }
  }

  // Keep Response suffix to avoid conflict with the native DOM Event type
  if (name === 'EventResponse') {
    return name;
  }

  name = name.replace(/Response$/, '');

  // Disambiguate two schemas that both map to DomainAvailability
  if (name === 'DomainAvailability') {
    if (schemaName.includes('availability__datasource')) {
      name = 'DomainAvailabilityList';
    } else if (schemaName.includes('domain__domain')) {
      name = 'DomainAvailabilityCheck';
    }
  }

  return name;
}

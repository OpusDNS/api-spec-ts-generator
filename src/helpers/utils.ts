export function toTypeName(schemaName: string): string {
  // Remove trailing underscores
  let name = schemaName.replace(/_+$/, '');
  // Sanitize hyphens: capitalize the letter after each hyphen and remove the hyphen
  name = name.replace(/-([a-zA-Z])/g, (_, c) => c.toUpperCase()).replace(/-/g, '');
  // Remove 'BulkOperationResponse_' prefix
  name = name.replace(/^BulkOperationResponse_/, '');

  // If name contains double underscores, use the last PascalCase segment
  if (name.includes('__')) {
    const parts = name.split('__');
    // Find the last part that looks like PascalCase
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^[A-Z][a-zA-Z0-9]*$/.test(parts[i])) {
        name = parts[i];
        break;
      }
    }
    // Fallback: use last segment
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      name = parts[parts.length - 1];
    }
  }

  // Special handling for EventResponse to avoid conflict with native Event type
  if (name === 'EventResponse') {
    return name; // Keep Response suffix to avoid conflict
  }

  // Remove only 'Response' from the end, keep 'Request' and 'Create'
  name = name.replace(/Response$/, '');

  // Special handling for DomainAvailability duplicates (after Response removal)
  if (name === 'DomainAvailability') {
    // Check the path context to create meaningful names
    if (schemaName.includes('availability__datasource')) {
      name = 'DomainAvailabilityList'; // Has meta and results (list response)
    } else if (schemaName.includes('domain__domain')) {
      name = 'DomainAvailabilityCheck'; // Has available, domain, reason (single check)
    }
  }

  return name;
}

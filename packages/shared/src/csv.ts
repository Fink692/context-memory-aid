import { ImportContactSchema, type ImportContact } from "./domain";

function parseCsvRows(input: string): { rows: string[][]; unclosedQuote: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (character !== undefined) {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return { rows, unclosedQuote: quoted };
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface CsvImportResult {
  contacts: ImportContact[];
  errors: string[];
}

export function parseAttendeeCsv(input: string): CsvImportResult {
  if (input.length > 1_000_000) {
    return { contacts: [], errors: ["CSV must be smaller than 1 MB."] };
  }

  const parsedRows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  if (parsedRows.unclosedQuote) {
    return { contacts: [], errors: ["CSV contains an unclosed quoted field."] };
  }
  const rows = parsedRows.rows;
  const header = rows.shift();
  if (!header) return { contacts: [], errors: ["CSV is empty."] };

  const indexByHeader = new Map(
    header.map((value, index) => [normalizedHeader(value), index]),
  );
  const valueAt = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const index = indexByHeader.get(name);
      if (index !== undefined) return row[index]?.trim() || undefined;
    }
    return undefined;
  };

  const contacts: ImportContact[] = [];
  const errors: string[] = [];

  rows.slice(0, 5_000).forEach((row, rowIndex) => {
    const lastSpokeRaw = valueAt(row, "lastspokeat", "lastspoke");
    let lastSpokeAt: string | undefined;
    if (lastSpokeRaw) {
      const parsedDate = new Date(lastSpokeRaw);
      if (Number.isNaN(parsedDate.getTime())) {
        errors.push(`Row ${rowIndex + 2}: lastSpoke is not a valid date.`);
        return;
      }
      lastSpokeAt = parsedDate.toISOString();
    }
    const socialPlatform = valueAt(row, "socialplatform", "platform");
    const socialHandle = valueAt(row, "socialhandle", "handle", "username");
    const socialUrl = valueAt(row, "socialurl", "profileurl");
    const socialLinks = socialPlatform && (socialHandle || socialUrl)
      ? [{ platform: socialPlatform, handle: socialHandle, url: socialUrl }]
      : undefined;
    const candidate = {
      displayName: valueAt(row, "displayname", "name") ?? "",
      company: valueAt(row, "company"),
      role: valueAt(row, "role", "title"),
      email: valueAt(row, "email", "emailaddress"),
      phone: valueAt(row, "phone", "phonenumber", "mobile"),
      socialLinks,
      metAt: valueAt(row, "metat", "met"),
      relationshipContext: valueAt(
        row,
        "relationshipcontext",
        "relationship",
        "howweknoweachother",
      ),
      lastSpokeAt,
      notes: valueAt(row, "notes", "note"),
    };

    const parsed = ImportContactSchema.safeParse(candidate);
    if (parsed.success) contacts.push(parsed.data);
    else errors.push(`Row ${rowIndex + 2}: ${parsed.error.issues[0]?.message ?? "Invalid row"}`);
  });

  if (rows.length > 5_000) errors.push("Only the first 5,000 rows were imported.");
  return { contacts, errors };
}

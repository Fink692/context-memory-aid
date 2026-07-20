export interface LocalFileStat {
  exists: boolean;
  isDirectory?: boolean;
  size?: number;
}

export class ImportFileSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileSafetyError";
  }
}

function usableSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function pickerSizeNeedsStat(size: number | null | undefined): boolean {
  return !usableSize(size);
}

export function assertImportFileSize({
  reportedSize,
  stat,
  maximumBytes,
  tooLargeMessage,
  unverifiableMessage,
}: {
  reportedSize: number | null | undefined;
  stat?: LocalFileStat;
  maximumBytes: number;
  tooLargeMessage: string;
  unverifiableMessage: string;
}): number {
  const verifiedSizes = [
    ...(usableSize(reportedSize) ? [reportedSize] : []),
    ...(stat?.exists === true && stat.isDirectory !== true && usableSize(stat.size) ? [stat.size] : []),
  ];
  const size = verifiedSizes.length ? Math.max(...verifiedSizes) : undefined;

  if (size === undefined) {
    throw new ImportFileSafetyError(unverifiableMessage);
  }
  if (size > maximumBytes) {
    throw new ImportFileSafetyError(tooLargeMessage);
  }
  return size;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff
      && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00
      && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export const inToMm = (inches: number) => inches * MM_PER_INCH;
export const mmToPt = (mm: number) => (mm / MM_PER_INCH) * PT_PER_INCH;

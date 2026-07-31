import type { BrandId, PaletteColor } from './types';

const rawColorsCsv = `
A1,#FAF4C8
A2,#FFFFD5
A3,#FEFF8B
A4,#FBED56
A5,#F4D738
A6,#FEAC4C
A7,#FE8B4C
A8,#FFDA45
A9,#FF995B
A10,#F77C31
A11,#FFDD99
A12,#FE9F72
A13,#FFC365
A14,#FD543D
A15,#FFF365
A16,#FFFF9F
A17,#FFE36E
A18,#FEBE7D
A19,#FD7C72
A20,#FFD568
A21,#FFE395
A22,#F4F57D
A23,#E6C9B7
A24,#F7F8A2
A25,#FFD67D
A26,#FFC830
B1,#E6EE31
B2,#63F347
B3,#9EF780
B4,#5DE035
B5,#35E352
B6,#65E2A6
B7,#3DAF80
B8,#1C9C4F
B9,#27523A
B10,#95D3C2
B11,#5D722A
B12,#166F41
B13,#CAEB7B
B14,#ADE946
B15,#2E5132
B16,#C5ED9C
B17,#9BB13A
B18,#E6EE49
B19,#24B88C
B20,#C2F0CC
B21,#156A6B
B22,#0B3C43
B23,#303A21
B24,#EEFCA5
B25,#4E846D
B26,#8D7A35
B27,#CCE1AF
B28,#9EE5B9
B29,#C5E254
B30,#E2FCB1
B31,#B0E792
B32,#9CAB5A
C1,#E8FFE7
C2,#A9F9FC
C3,#A0E2FB
C4,#41CCFF
C5,#01ACEB
C6,#50AAF0
C7,#3677D2
C8,#0F54C0
C9,#324BCA
C10,#3EBCE2
C11,#28DDDE
C12,#1C334D
C13,#CDE8FF
C14,#D5FDFF
C15,#22C4C6
C16,#1557A8
C17,#04D1F6
C18,#1D3344
C19,#1887A2
C20,#176DAF
C21,#BEDDFF
C22,#67B4BE
C23,#C8E2FF
C24,#7CC4FF
C25,#A9E5E5
C26,#3CAED8
C27,#D3DFFA
C28,#BBCFED
C29,#34488E
D1,#AEB4F2
D2,#858EDD
D3,#2F54AF
D4,#182A84
D5,#B843C5
D6,#AC7BDE
D7,#8854B3
D8,#E2D3FF
D9,#D5B9F8
D10,#361851
D11,#B9BAE1
D12,#DE9AD4
D13,#B90095
D14,#8B279B
D15,#2F1F90
D16,#E3E1EE
D17,#C4D4F6
D18,#A45EC7
D19,#D8C3D7
D20,#9C32B2
D21,#9A009B
D22,#333A95
D23,#EBDAFC
D24,#7786E5
D25,#494FC7
D26,#DFC2F8
E1,#FDD3CC
E2,#FEC0DF
E3,#FFB7E7
E4,#E8649E
E5,#F551A2
E6,#F13D74
E7,#C63478
E8,#FFDBE9
E9,#E970CC
E10,#D33793
E11,#FCDDD2
E12,#F78FC3
E13,#B5006D
E14,#FFD1BA
E15,#F8C7C9
E16,#FFF3EB
E17,#FFE2EA
E18,#FFC7DB
E19,#FEBAD5
E20,#D8C7D1
E21,#BD9DA1
E22,#B785A1
E23,#937A8D
E24,#E1BCE8
F1,#FD957B
F2,#FC3D46
F3,#F74941
F4,#FC283C
F5,#E7002F
F6,#943630
F7,#971937
F8,#BC0028
F9,#E2677A
F10,#8A4526
F11,#5A2121
F12,#FD4E6A
F13,#F35744
F14,#FFA9AD
F15,#D30022
F16,#FEC2A6
F17,#E69C79
F18,#D37C46
F19,#C1444A
F20,#CD9391
F21,#F7B4C6
F22,#FDC0D0
F23,#F67E66
F24,#E698AA
F25,#E54B4F
G1,#FFE2CE
G2,#FFC4AA
G3,#F4C3A5
G4,#E1B383
G5,#EDB045
G6,#E99C17
G7,#9D5B3E
G8,#753832
G9,#E6B483
G10,#D98C39
G11,#E0C593
G12,#FFC890
G13,#B7714A
G14,#8D614C
G15,#FCF9E0
G16,#F2D9BA
G17,#78524B
G18,#FFE4CC
G19,#E07935
G20,#A94023
G21,#B88558
H1,#FDFBFF
H2,#FEFFFF
H3,#B6B1BA
H4,#89858C
H5,#48464E
H6,#2F2B2F
H7,#000000
H8,#E7D6DB
H9,#EDEDED
H10,#EEE9EA
H11,#CECDD5
H12,#FFF5ED
H13,#F5ECD2
H14,#CFD7D3
H15,#98A6A8
H16,#1D1414
H17,#F1EDED
H18,#FFFDF0
H19,#F6EFE2
H20,#949FA3
H21,#FFFBE1
H22,#CACAD4
H23,#9A9D94
M1,#BCC6B8
M2,#8AA386
M3,#697D80
M4,#E3D2BC
M5,#D0CCAA
M6,#B0A782
M7,#B4A497
M8,#B38281
M9,#A58767
M10,#C5B2BC
M11,#9F7594
M12,#644749
M13,#D19066
M14,#C77362
M15,#757D78
`;

const rawExtendedColorsCsv = `
P1,#FCF7F8
P2,#B0A9AC
P3,#AFDCAB
P4,#FEA49F
P5,#EE8C3E
P6,#5FD0A7
P7,#EB9270
P8,#F0D958
P9,#D9D9D9
P10,#D9C7EA
P11,#F3ECC9
P12,#E6EEF2
P13,#AACBEF
P14,#337680
P15,#668575
P16,#FEBF45
P17,#FEA324
P18,#FEB89F
P19,#FFFEEC
P20,#FEBECF
P21,#ECBEBF
P22,#E4A89F
P23,#A56268
Q1,#F2A5E8
Q2,#E9EC91
Q3,#FFFF00
Q4,#FFEBFA
Q5,#76CEDE
R1,#D50D21
R2,#F92F83
R3,#FD8324
R4,#F8EC31
R5,#35C75B
R6,#238891
R7,#19779D
R8,#1A60C3
R9,#9A56B4
R10,#FFDB4C
R11,#FFEBFA
R12,#D8D5CE
R13,#55514C
R14,#9FE4DF
R15,#77CEE9
R16,#3ECFCA
R17,#4A867A
R18,#7FCD9D
R19,#CDE55D
R20,#E8C7B4
R21,#AD6F3C
R22,#6C372F
R23,#FEB872
R24,#F3C1C0
R25,#C9675E
R26,#D293BE
R27,#EA8CB1
R28,#9C87D6
T1,#FFFFFF
Y1,#FD6FB4
Y2,#FEB481
Y3,#D7FAA0
Y4,#8BDBFA
Y5,#E987EA
ZG1,#DAABB3
ZG2,#D6AA87
ZG3,#C1BD8D
ZG4,#96869F
ZG5,#8490A6
ZG6,#94BFE2
ZG7,#E2A9D2
ZG8,#AB91C0
`;


export const brandLabels: Record<BrandId, string> = {
  MARD: 'MARD',
};

export const paletteVersion = 'mard-291-v1';

function parseRawColors(csv: string): Array<{ code: string; hex: string }> {
  return csv
  .trim()
  .split('\n')
  .map((line) => {
    const [code, hex] = line.split(',');
    return { code: code.trim(), hex: hex.trim() };
  });
}

const rawColors = parseRawColors(rawColorsCsv);
const rawCompleteColors = [...rawColors, ...parseRawColors(rawExtendedColorsCsv)];

function makePalette(colors: Array<{ code: string; hex: string }>): PaletteColor[] {
  return colors.map(({ code, hex }) => {
  const rgb = hexToRgb(hex);
  const family = code.startsWith('ZG') ? 'ZG' : code[0];
  return {
    id: `mard-${code.toLowerCase()}`,
    primaryBrand: 'MARD',
    primaryCode: code,
    hex,
    rgb,
    group: family,
    name: `MARD ${code}`,
    codes: {
      MARD: code,
    },
  };
});
}

export const basicPalette: PaletteColor[] = makePalette(rawColors);
export const completePalette: PaletteColor[] = makePalette(rawCompleteColors);
export const palette: PaletteColor[] = basicPalette;

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function getColor(id: string | null): PaletteColor | undefined {
  if (!id) return undefined;
  return completePalette.find((color) => color.id === id);
}

export function nearestPaletteColor(
  rgb: [number, number, number],
  candidates: PaletteColor[] = palette,
): PaletteColor {
  let best = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of candidates) {
    const distance = colorDistance(rgb, color.rgb);
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
}

export function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const redMean = (a[0] + b[0]) / 2;
  const r = a[0] - b[0];
  const g = a[1] - b[1];
  const blue = a[2] - b[2];
  return Math.sqrt((2 + redMean / 256) * r * r + 4 * g * g + (2 + (255 - redMean) / 256) * blue * blue);
}

export function mappedCode(color: PaletteColor, brand: BrandId): string {
  return color.codes[brand] ?? color.primaryCode;
}

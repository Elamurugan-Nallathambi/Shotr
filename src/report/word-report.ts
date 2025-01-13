import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { RunManifest } from '../core/types.js';
import type { ImageAsset } from './assets.js';

function metaRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 75, type: WidthType.PERCENTAGE },
        children: [new Paragraph(value)],
      }),
    ],
  });
}

function assetSection(asset: ImageAsset): (Paragraph | Table)[] {
  const nodes: (Paragraph | Table)[] = [
    new Paragraph({ text: asset.title, heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        metaRow('Page', asset.pageId),
        metaRow('Status', asset.status),
        metaRow('Profile', `${asset.profile} (${asset.viewport})`),
        metaRow('Browser', asset.browser),
        metaRow('URL', asset.url),
      ],
    }),
  ];

  if (asset.buffer && asset.width && asset.height) {
    nodes.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: asset.buffer,
            transformation: { width: asset.width, height: asset.height },
          }),
        ],
      }),
    );
  } else if (asset.error) {
    nodes.push(new Paragraph({ children: [new TextRun({ text: `Error: ${asset.error}`, color: '991B1B' })] }));
  }
  nodes.push(new Paragraph(''));
  return nodes;
}

/** Build a .docx report as a Buffer. */
export async function buildWordReport(manifest: RunManifest, assets: ImageAsset[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: `${manifest.projectName} — Screenshot Report`, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(
      `Environment: ${manifest.environment}  ·  ${manifest.successful}/${manifest.total} captured  ·  ${manifest.finishedAt}`,
    ),
    new Paragraph(''),
    ...assets.flatMap((a) => assetSection(a)),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

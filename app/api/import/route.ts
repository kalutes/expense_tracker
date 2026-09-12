import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { importStatementFile, FileImportResult } from '@/lib/importer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 1. Verify authentication
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as (File | Blob)[];

    // Also check single 'file' field
    const singleFile = formData.get('file') as (File | Blob) | null;
    if (singleFile && !files.includes(singleFile)) {
      files.push(singleFile);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Please upload at least one .csv or .pdf file.' },
        { status: 400 }
      );
    }

    const results: FileImportResult[] = [];
    let totalInserted = 0;
    let totalDuplicates = 0;
    let totalParsed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const file of files) {
      const filename = 'name' in file ? (file as File).name : 'statement_upload.csv';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const res = await importStatementFile({
        buffer,
        originalFilename: filename,
      });

      results.push(res);

      if (res.success) {
        succeeded++;
        totalInserted += res.totalInserted;
        totalDuplicates += res.totalDuplicates;
        totalParsed += res.totalParsed;
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      success: failed === 0,
      summary: {
        totalFiles: files.length,
        succeeded,
        failed,
        totalParsed,
        totalInserted,
        totalDuplicates,
      },
      results,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Import failed: ${errorMsg}` },
      { status: 500 }
    );
  }
}

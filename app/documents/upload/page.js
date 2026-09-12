'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileUp, X } from 'lucide-react';
import PageHeader from '../../../components/PageHeader';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ExcelUploadOptions from '../../../components/ExcelUploadOptions';
import {
  ALLOWED_ACCEPT,
  ALLOWED_EXTENSIONS,
  detectFileType,
  isExcelFileType,
} from '../../../lib/documents/constants';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

function isAllowedFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export default function DocumentUploadPage() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [revisionPrompt, setRevisionPrompt] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []).filter(isAllowedFile);
    if (!incoming.length) return;
    setQueue((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const merged = [...prev];
      for (const file of incoming) {
        if (!names.has(file.name)) {
          merged.push({
            name: file.name,
            file,
            xlsxOptions: isExcelFileType(detectFileType(file.name))
              ? { useRecommended: true }
              : null,
          });
        }
      }
      return merged;
    });
  }, []);

  function removeFile(name) {
    setQueue((prev) => prev.filter((f) => f.name !== name));
  }

  function updateXlsxOptions(name, xlsxOptions) {
    setQueue((prev) =>
      prev.map((item) => (item.name === name ? { ...item, xlsxOptions } : item))
    );
  }

  async function uploadOne(file, options = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('isRevision', options.isRevision ? 'true' : 'false');
    if (options.supersedesId) form.append('supersedesId', options.supersedesId);
    if (options.xlsxOptions) {
      form.append('xlsxOptions', JSON.stringify(options.xlsxOptions));
    }

    const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('업로드 응답을 해석할 수 없습니다.');
    }

    if (!res.ok) {
      const devDetail =
        process.env.NODE_ENV === 'development' && json.message
          ? `\n\n[개발] ${json.message}`
          : '';
      throw new Error((json.error || '업로드 실패') + devDetail);
    }
    return json.document;
  }

  async function checkDuplicate(fileName) {
    const res = await fetch(`/api/documents/duplicate?fileName=${encodeURIComponent(fileName)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '중복 확인 실패');
    return json.existing;
  }

  async function processQueue(items, startIndex = 0) {
    if (startIndex >= items.length) {
      router.push('/documents');
      return;
    }

    const item = items[startIndex];
    const file = item.file;
    const existing = await checkDuplicate(file.name);

    if (existing) {
      setRevisionPrompt({
        file,
        existing,
        files: items,
        index: startIndex,
        xlsxOptions: item.xlsxOptions,
      });
      return;
    }

    const xlsxOptions = isExcelFileType(detectFileType(file.name))
      ? item.xlsxOptions || { useRecommended: true }
      : undefined;
    await uploadOne(file, { isRevision: false, xlsxOptions });
    await processQueue(items, startIndex + 1);
  }

  async function handleStartUpload() {
    if (!queue.length || uploading) return;
    setUploading(true);
    try {
      await processQueue(queue);
    } catch (err) {
      alert(err.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRevisionChoice(isRevision) {
    if (!revisionPrompt) return;
    const { file, existing, files, index, xlsxOptions } = revisionPrompt;
    setRevisionPrompt(null);
    setUploading(true);
    try {
      await uploadOne(file, {
        isRevision,
        supersedesId: isRevision ? existing.id : undefined,
        xlsxOptions: isExcelFileType(detectFileType(file.name))
          ? xlsxOptions || { useRecommended: true }
          : undefined,
      });
      await processQueue(files, index + 1);
    } catch (err) {
      alert(err.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="KNOWLEDGE BASE"
        title="문서 업로드"
        description="PDF, DOCX, TXT, XLSX, XLS · 여러 파일 동시 업로드 가능"
        actions={
          <Link href="/documents" className={btnSecondary}>
            목록으로
          </Link>
        }
      />

      <div className="space-y-6 px-4 pb-8 pt-4 md:px-8">
        <div
          className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 transition-colors ${
            dragOver ? 'border-accent bg-accentSoft/30' : 'border-border bg-surface'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
        >
          <FileUp className="mb-3 h-10 w-10 text-accent" />
          <p className="text-sm font-medium text-text">파일을 끌어다 놓거나 클릭하여 선택</p>
          <p className="mt-1 text-xs text-muted">PDF · DOCX · TXT · XLSX · XLS</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {queue.length > 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3 text-sm font-medium text-text">
              업로드 대기 ({queue.length})
            </div>
            <ul className="divide-y divide-border">
              {queue.map((item) => (
                <li key={item.name} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-text">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(item.name)}
                      className="rounded-lg p-1 text-muted hover:bg-surface2 hover:text-text"
                      aria-label="제거"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {isExcelFileType(detectFileType(item.name)) ? (
                    <ExcelUploadOptions
                      file={item.file}
                      value={item.xlsxOptions || { useRecommended: true }}
                      onChange={(next) => updateXlsxOptions(item.name, next)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                className={btnPrimary}
                disabled={uploading}
                onClick={handleStartUpload}
              >
                {uploading ? '업로드 중…' : '업로드 시작'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {revisionPrompt ? (
        <ConfirmDialog
          title="같은 파일명이 있습니다"
          message={`「${revisionPrompt.existing.title || revisionPrompt.existing.file_name}」이(가) 이미 있습니다. 개정판으로 올릴까요?`}
          confirmLabel="개정판으로 업로드"
          cancelLabel="새 문서로 업로드"
          onConfirm={() => handleRevisionChoice(true)}
          onCancel={() => handleRevisionChoice(false)}
        />
      ) : null}
    </div>
  );
}

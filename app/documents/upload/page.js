'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileUp, X } from 'lucide-react';
import PageHeader from '../../../components/PageHeader';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { ALLOWED_EXTENSIONS } from '../../../lib/documents/constants';

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
        if (!names.has(file.name)) merged.push(file);
      }
      return merged;
    });
  }, []);

  function removeFile(name) {
    setQueue((prev) => prev.filter((f) => f.name !== name));
  }

  async function uploadOne(file, options = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('isRevision', options.isRevision ? 'true' : 'false');
    if (options.supersedesId) form.append('supersedesId', options.supersedesId);

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

  async function processQueue(files, startIndex = 0) {
    if (startIndex >= files.length) {
      router.push('/documents');
      return;
    }

    const file = files[startIndex];
    const existing = await checkDuplicate(file.name);

    if (existing) {
      setRevisionPrompt({
        file,
        existing,
        files,
        index: startIndex,
      });
      return;
    }

    await uploadOne(file, { isRevision: false });
    await processQueue(files, startIndex + 1);
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
    const { file, existing, files, index } = revisionPrompt;
    setRevisionPrompt(null);
    setUploading(true);
    try {
      await uploadOne(file, {
        isRevision,
        supersedesId: isRevision ? existing.id : undefined,
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
        description="PDF, DOCX, TXT · 여러 파일 동시 업로드 가능"
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
          <p className="mt-1 text-xs text-muted">PDF · DOCX · TXT</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
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
              {queue.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="truncate text-text">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.name)}
                    className="rounded-lg p-1 text-muted hover:bg-surface2 hover:text-text"
                    aria-label="제거"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Link href="/documents" className={btnSecondary}>
            취소
          </Link>
          <button
            type="button"
            className={btnPrimary}
            disabled={!queue.length || uploading}
            onClick={handleStartUpload}
          >
            {uploading ? '업로드 중...' : `${queue.length || 0}개 업로드`}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(revisionPrompt)}
        title="개정판 확인"
        message={
          revisionPrompt
            ? `같은 이름의 활성 문서가 있습니다.\n「${revisionPrompt.existing.title || revisionPrompt.existing.file_name}」(v${revisionPrompt.existing.version})의 개정판인가요?\n\n개정판이면 이전 버전은 비활성화되고 버전이 올라갑니다. 별개 문서면 새로 등록됩니다.`
            : ''
        }
        confirmLabel="개정판입니다"
        cancelLabel="별개 문서입니다"
        onConfirm={() => handleRevisionChoice(true)}
        onCancel={() => handleRevisionChoice(false)}
      />
    </div>
  );
}

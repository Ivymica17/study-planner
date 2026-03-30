import { Document, Page } from 'react-pdf';

function ModuleListItem({ module, selected, onSelect, onDelete }) {
  return (
    <div
      className={`w-full rounded-3xl border px-4 py-3 transition ${
        selected
          ? 'border-sky-500 bg-sky-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onSelect(module._id)} className="min-w-0 flex-1 text-left">
          <div className="line-clamp-2 text-sm font-semibold text-slate-800">{module.title}</div>
          <div className="mt-1 text-xs text-slate-500">{module.fileName || 'Untitled upload'}</div>
        </button>
        <div className="flex shrink-0 items-start gap-2">
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
              module.fileType === 'application/pdf'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {module.fileType === 'application/pdf' ? 'PDF' : 'Text'}
          </span>
          <button
            type="button"
            onClick={() => onDelete(module)}
            className="rounded-full bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"
            title="Delete handout"
            aria-label={`Delete ${module.title}`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7 5 7M10 11v6m4-6v6M9 7V4h6v3m-7 0 1 12h6l1-12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudySidebar({
  modules,
  selectedModuleId,
  pdfUrl,
  totalPages,
  currentPage,
  onSelectModule,
  onDeleteModule,
  onSelectPage,
  uploadTitle,
  uploadFileName,
  uploading,
  onUploadTitleChange,
  onUploadFileChange,
  onUpload,
}) {
  return (
    <aside className="flex h-full w-full max-w-[320px] flex-col border-r border-slate-200 bg-[#f7f9fc]">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Study Area</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">PDF Workspace</h2>
          <p className="mt-1 text-sm text-slate-600">Upload reviewers, modules, and handouts, then reopen them with saved annotations.</p>
        </div>

        <form className="space-y-3" onSubmit={onUpload}>
          <input
            type="text"
            value={uploadTitle}
            onChange={(event) => onUploadTitleChange(event.target.value)}
            placeholder="Module title"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
          <label className="block cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600 transition hover:border-sky-400 hover:bg-sky-50">
            <span className="block font-medium text-slate-800">Upload PDF</span>
            <span className="mt-1 block text-xs text-slate-500">
              {uploadFileName || 'Choose a module, handout, or reviewer'}
            </span>
            <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={onUploadFileChange} />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : 'Upload to Study Area'}
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Files</h3>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-500">
              {modules.length}
            </span>
          </div>

          <div className="space-y-3">
            {modules.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                No uploads yet. Add a PDF to start building your study workspace.
              </div>
            ) : (
              modules.map((module) => (
                <ModuleListItem
                  key={module._id}
                  module={module}
                  selected={module._id === selectedModuleId}
                  onSelect={onSelectModule}
                  onDelete={onDeleteModule}
                />
              ))
            )}
          </div>
        </section>

        {pdfUrl && totalPages > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Pages</h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-500">
                {totalPages}
              </span>
            </div>

            <Document file={pdfUrl} loading={<div className="text-sm text-slate-500">Loading thumbnails...</div>}>
              <div className="space-y-3">
                {Array.from({ length: totalPages }, (_, index) => {
                  const pageNumber = index + 1;
                  const active = pageNumber === currentPage;

                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => onSelectPage(pageNumber)}
                      className={`w-full rounded-3xl border p-3 text-left transition ${
                        active
                          ? 'border-sky-500 bg-sky-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <span>Page {pageNumber}</span>
                        {active && <span className="text-sky-700">Open</span>}
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                        <Page
                          pageNumber={pageNumber}
                          width={220}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          loading={<div className="flex h-[280px] items-center justify-center text-xs text-slate-400">Rendering...</div>}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </Document>
          </section>
        )}
      </div>
    </aside>
  );
}

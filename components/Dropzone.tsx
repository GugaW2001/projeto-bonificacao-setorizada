"use client";

import { useRef, useState } from "react";

interface DropzoneProps {
  onFile: (arquivo: File) => void;
  aceitos?: string;
}

/** Área de arrastar-e-soltar para a planilha do mês (parse acontece só no servidor). */
export default function Dropzone({ onFile, aceitos = ".xls,.xlsx,.csv" }: DropzoneProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const aplicar = (f: File | undefined) => {
    if (!f) return;
    const extensaoOk = aceitos.split(",").some((e) => f.name.toLowerCase().endsWith(e.trim()));
    if (!extensaoOk) return;
    setArquivo(f);
    onFile(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        aplicar(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
        arrastando ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400"
      }`}
    >
      <input ref={inputRef} type="file" accept={aceitos} className="hidden" onChange={(e) => aplicar(e.target.files?.[0])} />
      {arquivo ? (
        <p className="text-sm text-slate-700 font-medium">
          {arquivo.name}{" "}
          <span className="text-slate-400 font-normal">— {(arquivo.size / 1024 / 1024).toFixed(2)} MB · clique para trocar</span>
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          Arraste a planilha aqui ou <span className="text-blue-600 font-medium">clique para selecionar</span> (
          {aceitos.replace(/\./g, "").replace(/,/g, ", ")})
        </p>
      )}
    </div>
  );
}
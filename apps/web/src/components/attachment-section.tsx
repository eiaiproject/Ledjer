import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize } from "@/lib/utils";
import { listAttachments, deleteAttachment, getAttachmentDownloadUrl, type AttachmentInfo } from "@/lib/api/attachments";

interface Props {
  entityType: string;
  entityId: string;
}

export function AttachmentSection({ entityType, entityId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["attachments", entityType, entityId],
    queryFn: () => listAttachments(entityType, entityId),
    enabled: !!entityId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attachments", entityType, entityId] }),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entity_type", entityType);
      form.append("entity_id", entityId);
      await fetch("/api/attachments/upload", { method: "POST", body: form, credentials: "include" });
      await refetch();
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const attachments: AttachmentInfo[] = data?.attachments ?? [];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-wood-700">Lampiran</h3>
          <div>
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" /> {/* ponytail: server-side size validation also needed; R2 max per object */}
            <Button variant="ghost" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Mengunggah..." : "+ Unggah"}
            </Button>
          </div>
        </div>

        {isLoading && <Skeleton className="h-12 w-full" />}

        {attachments.length === 0 && !isLoading && (
          <p className="text-xs text-wood-400 py-2">Belum ada lampiran.</p>
        )}

        {attachments.length > 0 && (
          <ul className="divide-y divide-wood-100">
            {attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between py-2">
                <a
                  href={getAttachmentDownloadUrl(att.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate flex-1"
                >
                  {att.fileName}
                </a>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs text-wood-400">{formatFileSize(att.fileSize)}</span>
                  <button type="button"
                    type="button"
                    onClick={() => {
                      if (confirm("Hapus lampiran ini?")) deleteMutation.mutate(att.id);
                    }}
                    className="text-xs text-red-500 hover:text-red-700"
                    aria-label={`Hapus ${att.fileName}`}
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

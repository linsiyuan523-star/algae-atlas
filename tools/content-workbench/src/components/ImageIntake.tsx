import {
  FileImage,
  FileInput,
  ImagePlus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import {
  DEFAULT_IMAGE_PROCESSING_OPTIONS,
  imagePublicationIssues,
  licenseOptions,
  mediaPurposeOptions,
  stageSelectedFile,
} from "../media";
import type {
  ImageMetadataDraft,
  MediaApi,
  MediaPurpose,
  ImageProcessingOptions,
  StagedImage,
} from "../media";

type ImageIntakeProps = {
  api: MediaApi;
  draftId: string;
  contentType: string;
  images: readonly StagedImage[];
  englishEnabled: boolean;
  disabled: boolean;
  loadError?: string | null;
  onStaged: (image: StagedImage) => void;
  onUpdated: (image: StagedImage, persisted: boolean) => void;
  onInsertBody: (image: StagedImage) => void;
};

export function ImageIntake({
  api,
  draftId,
  contentType,
  images,
  englishEnabled,
  disabled,
  loadError,
  onStaged,
  onUpdated,
  onInsertBody,
}: ImageIntakeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [purpose, setPurpose] = useState<MediaPurpose>(
    contentType === "team-member" ? "portrait" : "cover",
  );
  const [processing, setProcessing] = useState<ImageProcessingOptions>(() => ({
    ...DEFAULT_IMAGE_PROCESSING_OPTIONS,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [stagingMessage, setStagingMessage] = useState<string | null>(null);
  const [stagingError, setStagingError] = useState<string | null>(null);
  const [savingImageId, setSavingImageId] = useState<string | null>(null);
  const [saveMessages, setSaveMessages] = useState<Record<string, string>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setPurpose(contentType === "team-member" ? "portrait" : "cover");
  }, [contentType]);

  async function handleFiles(files: readonly File[]) {
    if (disabled || isStaging || files.length === 0) {
      return;
    }
    setIsStaging(true);
    setStagingMessage(null);
    setStagingError(null);
    let accepted = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const staged = await stageSelectedFile(
          api,
          draftId,
          purpose,
          file,
          processing,
        );
        onStaged(staged);
        accepted += 1;
      } catch (caught) {
        errors.push(`${file.name}：${describeError(caught)}`);
      }
    }
    if (accepted > 0) {
      setStagingMessage(`已安全暂存 ${accepted} 张图片。`);
    }
    if (errors.length > 0) {
      setStagingError(errors.join(" "));
    }
    setIsStaging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSelection(event: ChangeEvent<HTMLInputElement>) {
    void handleFiles(Array.from(event.target.files ?? []));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  }

  function handleDropKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function updateMetadata<Key extends keyof ImageMetadataDraft>(
    image: StagedImage,
    field: Key,
    value: ImageMetadataDraft[Key],
  ) {
    onUpdated(
      {
        ...image,
        metadata: { ...image.metadata, [field]: value },
      },
      false,
    );
    setDirtyIds((current) => new Set(current).add(image.id));
    setSaveMessages((current) => ({ ...current, [image.id]: "" }));
  }

  async function saveMetadata(image: StagedImage) {
    setSavingImageId(image.id);
    setSaveMessages((current) => ({ ...current, [image.id]: "" }));
    try {
      const saved = await api.saveMetadata(
        draftId,
        image.id,
        image.metadata,
      );
      onUpdated(saved, true);
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });
      setSaveMessages((current) => ({
        ...current,
        [image.id]: "元数据已保存。",
      }));
    } catch (caught) {
      setSaveMessages((current) => ({
        ...current,
        [image.id]: `保存失败：${describeError(caught)}`,
      }));
    } finally {
      setSavingImageId(null);
    }
  }

  return (
    <section className="image-intake" aria-labelledby="image-intake-title">
      <header className="image-intake-heading">
        <div>
          <h4 id="image-intake-title">图片接收与许可</h4>
          <span>{images.length} 张已暂存图片</span>
        </div>
        <div className="image-intake-controls">
          <div className="image-purpose-control">
          <label htmlFor="image-purpose">图片用途</label>
          <select
            id="image-purpose"
            value={purpose}
            disabled={disabled || isStaging}
            onChange={(event) =>
              setPurpose(event.target.value as MediaPurpose)
            }
          >
            {mediaPurposeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          </div>
          <div className="image-processing-control">
            <label htmlFor="image-max-dimension">最大边长</label>
            <select
              id="image-max-dimension"
              value={processing.maxWidth}
              disabled={disabled || isStaging}
              onChange={(event) => {
                const maxDimension = Number(event.target.value);
                setProcessing((current) => ({
                  ...current,
                  maxWidth: maxDimension,
                  maxHeight: maxDimension,
                }));
              }}
            >
              <option value={1600}>1600 px</option>
              <option value={2048}>2048 px</option>
              <option value={2560}>2560 px</option>
              <option value={4096}>4096 px</option>
            </select>
          </div>
          <div className="image-processing-control">
            <label htmlFor="image-max-output">输出上限</label>
            <select
              id="image-max-output"
              value={processing.maxOutputBytes}
              disabled={disabled || isStaging}
              onChange={(event) =>
                setProcessing((current) => ({
                  ...current,
                  maxOutputBytes: Number(event.target.value),
                }))
              }
            >
              <option value={512 * 1024}>512 KiB</option>
              <option value={1024 * 1024}>1 MiB</option>
              <option value={2 * 1024 * 1024}>2 MiB</option>
              <option value={4 * 1024 * 1024}>4 MiB</option>
            </select>
          </div>
          <label className="image-original-option" htmlFor="image-preserve-original">
            <input
              id="image-preserve-original"
              type="checkbox"
              checked={processing.preserveOriginal}
              disabled={disabled || isStaging}
              onChange={(event) =>
                setProcessing((current) => ({
                  ...current,
                  preserveOriginal: event.target.checked,
                }))
              }
            />
            <span>保留原图（仅本地）</span>
          </label>
        </div>
      </header>

      <div
        className={`image-drop-zone${isDragging ? " image-drop-zone-active" : ""}`}
        role="button"
        tabIndex={disabled || isStaging ? -1 : 0}
        aria-disabled={disabled || isStaging}
        aria-label="选择或拖放图片"
        onClick={() => {
          if (!disabled && !isStaging) {
            fileInputRef.current?.click();
          }
        }}
        onKeyDown={handleDropKey}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isStaging ? (
          <Upload aria-hidden="true" className="image-upload-spinner" size={24} />
        ) : (
          <ImagePlus aria-hidden="true" size={24} />
        )}
        <span>{isStaging ? "正在读取并暂存..." : "选择或拖放图片"}</span>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || isStaging}
          aria-label="选择图片文件"
          onChange={handleSelection}
        />
      </div>

      {loadError ? (
        <p className="operation-error" role="alert">
          无法读取已暂存图片：{loadError}
        </p>
      ) : null}
      {stagingMessage ? (
        <p className="operation-notice" role="status">
          {stagingMessage}
        </p>
      ) : null}
      {stagingError ? (
        <p className="operation-error" role="alert">
          {stagingError}
        </p>
      ) : null}

      <div className="staged-image-list">
        {images.map((image) => (
          <StagedImageEditor
            key={image.id}
            image={image}
            englishEnabled={englishEnabled}
            disabled={disabled}
            dirty={dirtyIds.has(image.id)}
            saving={savingImageId === image.id}
            saveMessage={saveMessages[image.id]}
            onMetadataChange={(field, value) =>
              updateMetadata(image, field, value)
            }
            onSave={() => void saveMetadata(image)}
            onInsertBody={() => onInsertBody(image)}
          />
        ))}
      </div>
    </section>
  );
}

function StagedImageEditor({
  image,
  englishEnabled,
  disabled,
  dirty,
  saving,
  saveMessage,
  onMetadataChange,
  onSave,
  onInsertBody,
}: {
  image: StagedImage;
  englishEnabled: boolean;
  disabled: boolean;
  dirty: boolean;
  saving: boolean;
  saveMessage?: string;
  onMetadataChange: <Key extends keyof ImageMetadataDraft>(
    field: Key,
    value: ImageMetadataDraft[Key],
  ) => void;
  onSave: () => void;
  onInsertBody: () => void;
}) {
  const metadata = image.metadata;
  const zhIssues = imagePublicationIssues(image, "zh");
  const enIssues = imagePublicationIssues(image, "en");
  const idPrefix = `staged-image-${image.id}`;

  return (
    <article className="staged-image-item">
      <header className="staged-image-heading">
        <FileImage aria-hidden="true" size={21} />
        <div>
          <h5>{image.originalName}</h5>
          <span>{purposeLabel(image.purpose)}</span>
        </div>
      </header>

      <dl className="staged-image-facts">
        <div>
          <dt>类型与尺寸</dt>
          <dd>
            {image.mimeType} · {image.width} × {image.height} ·{" "}
            {formatBytes(image.bytes)}
          </dd>
        </div>
        <div>
          <dt>媒体 ID</dt>
          <dd>
            <code>{image.id}</code>
          </dd>
        </div>
        <div>
          <dt>目标路径</dt>
          <dd>
            <code>{image.targetPath}</code>
          </dd>
        </div>
        {image.processing ? (
          <>
            <div>
              <dt>处理结果</dt>
              <dd>
                WebP · {image.processing.privacyMetadataRemoved ? "隐私元数据已清除" : "待核对"}
              </dd>
            </div>
            {image.processing.thumbnail ? (
              <div>
                <dt>封面缩略图</dt>
                <dd>
                  {image.processing.thumbnail.width} × {image.processing.thumbnail.height} ·{" "}
                  {formatBytes(image.processing.thumbnail.bytes)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>原图</dt>
              <dd>{image.processing.originalRetained ? "仅本地保留" : "不保留"}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className="media-candidate-grid">
        <CandidateStatus locale="中文" issues={zhIssues} />
        {englishEnabled ? <CandidateStatus locale="英文" issues={enIssues} /> : null}
      </div>

      <div className="image-metadata-grid">
        <MetadataTextField
          id={`${idPrefix}-provider`}
          label="作者或提供者"
          value={metadata.creatorOrProvider}
          required
          invalid={!metadata.creatorOrProvider.trim()}
          disabled={disabled}
          maxLength={500}
          onChange={(value) => onMetadataChange("creatorOrProvider", value)}
        />
        <MetadataTextField
          id={`${idPrefix}-source`}
          label="来源链接"
          value={metadata.sourceUrl}
          type="url"
          disabled={disabled}
          maxLength={2048}
          placeholder="https://"
          onChange={(value) => onMetadataChange("sourceUrl", value)}
        />
        <div className="field-group">
          <label htmlFor={`${idPrefix}-license-id`}>许可标识</label>
          <select
            id={`${idPrefix}-license-id`}
            value={metadata.licenseIdentifier}
            disabled={disabled}
            aria-invalid={!metadata.licenseIdentifier}
            onChange={(event) =>
              onMetadataChange("licenseIdentifier", event.target.value)
            }
          >
            {licenseOptions.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <MetadataTextField
          id={`${idPrefix}-license-name`}
          label="许可名称"
          value={metadata.licenseName}
          required
          invalid={!metadata.licenseName.trim()}
          disabled={disabled}
          maxLength={500}
          onChange={(value) => onMetadataChange("licenseName", value)}
        />
        <MetadataTextField
          id={`${idPrefix}-license-url`}
          label="许可链接"
          value={metadata.licenseUrl}
          type="url"
          disabled={disabled}
          maxLength={2048}
          placeholder="https://"
          onChange={(value) => onMetadataChange("licenseUrl", value)}
        />
        <MetadataTextField
          id={`${idPrefix}-attribution`}
          label="署名文字"
          value={metadata.attribution}
          required
          invalid={!metadata.attribution.trim()}
          disabled={disabled}
          maxLength={1000}
          onChange={(value) => onMetadataChange("attribution", value)}
        />
        <div className="field-group">
          <label htmlFor={`${idPrefix}-rights`}>权利状态</label>
          <select
            id={`${idPrefix}-rights`}
            value={metadata.rightsStatus}
            disabled={disabled}
            aria-invalid={metadata.rightsStatus !== "approved"}
            onChange={(event) =>
              onMetadataChange(
                "rightsStatus",
                event.target.value as ImageMetadataDraft["rightsStatus"],
              )
            }
          >
            <option value="pending">待确认</option>
            <option value="approved">已确认</option>
            <option value="restricted">受限</option>
          </select>
        </div>
        <div className="field-group">
          <label htmlFor={`${idPrefix}-scope`}>使用范围</label>
          <select
            id={`${idPrefix}-scope`}
            value={metadata.usageScope}
            disabled={disabled}
            aria-invalid={metadata.usageScope !== "public-site"}
            onChange={(event) =>
              onMetadataChange(
                "usageScope",
                event.target.value as ImageMetadataDraft["usageScope"],
              )
            }
          >
            <option value="internal-only">仅内部</option>
            <option value="education-only">仅教育用途</option>
            <option value="public-site">公开网站</option>
          </select>
        </div>
        <div className="field-group">
          <label htmlFor={`${idPrefix}-identification`}>鉴定状态</label>
          <select
            id={`${idPrefix}-identification`}
            value={metadata.identificationStatus}
            disabled={disabled}
            onChange={(event) =>
              onMetadataChange(
                "identificationStatus",
                event.target
                  .value as ImageMetadataDraft["identificationStatus"],
              )
            }
          >
            <option value="not-applicable">不适用</option>
            <option value="unverified">未核验</option>
            <option value="provisional">暂定</option>
            <option value="verified">已核验</option>
          </select>
        </div>
        <div className="field-group image-people-field">
          <label htmlFor={`${idPrefix}-people`}>
            <input
              id={`${idPrefix}-people`}
              type="checkbox"
              checked={metadata.identifiablePeople}
              disabled={disabled}
              onChange={(event) =>
                onMetadataChange("identifiablePeople", event.target.checked)
              }
            />
            <span>含可识别人物</span>
          </label>
        </div>
        {metadata.identifiablePeople ? (
          <>
            <div className="field-group">
              <label htmlFor={`${idPrefix}-consent`}>人物同意</label>
              <select
                id={`${idPrefix}-consent`}
                value={metadata.consentState}
                disabled={disabled}
                aria-invalid={metadata.consentState !== "confirmed"}
                onChange={(event) =>
                  onMetadataChange(
                    "consentState",
                    event.target.value as ImageMetadataDraft["consentState"],
                  )
                }
              >
                <option value="pending">待确认</option>
                <option value="confirmed">已确认</option>
                <option value="not-applicable">不适用</option>
              </select>
            </div>
            <MetadataTextField
              id={`${idPrefix}-consent-reference`}
              label="人物授权引用"
              value={metadata.consentReference}
              required
              invalid={!metadata.consentReference.trim()}
              disabled={disabled}
              maxLength={500}
              onChange={(value) =>
                onMetadataChange("consentReference", value)
              }
            />
          </>
        ) : null}
        <MetadataTextField
          id={`${idPrefix}-alt-zh`}
          label="中文替代文字"
          value={metadata.altZh}
          required
          invalid={!metadata.altZh.trim()}
          disabled={disabled}
          maxLength={1000}
          onChange={(value) => onMetadataChange("altZh", value)}
        />
        <MetadataTextField
          id={`${idPrefix}-alt-en`}
          label="英文替代文字"
          value={metadata.altEn}
          invalid={englishEnabled && !metadata.altEn.trim()}
          disabled={disabled}
          maxLength={1000}
          onChange={(value) => onMetadataChange("altEn", value)}
        />
        <MetadataTextField
          id={`${idPrefix}-caption-zh`}
          label="中文说明"
          value={metadata.captionZh}
          disabled={disabled}
          maxLength={2000}
          multiline
          onChange={(value) => onMetadataChange("captionZh", value)}
        />
        <MetadataTextField
          id={`${idPrefix}-caption-en`}
          label="英文说明"
          value={metadata.captionEn}
          disabled={disabled}
          maxLength={2000}
          multiline
          onChange={(value) => onMetadataChange("captionEn", value)}
        />
      </div>

      <div className="staged-image-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={disabled || saving}
          onClick={onSave}
        >
          <Save aria-hidden="true" size={17} />
          {saving ? "正在保存..." : dirty ? "保存元数据" : "再次保存"}
        </button>
        {image.purpose === "body" ? (
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || !metadata.altZh.trim()}
            onClick={onInsertBody}
          >
            <FileInput aria-hidden="true" size={17} />
            插入中文正文
          </button>
        ) : null}
        {saveMessage ? (
          <span
            className={saveMessage.startsWith("保存失败") ? "field-error" : "operation-notice"}
            role={saveMessage.startsWith("保存失败") ? "alert" : "status"}
          >
            {saveMessage}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function CandidateStatus({
  locale,
  issues,
}: {
  locale: string;
  issues: readonly string[];
}) {
  const eligible = issues.length === 0;
  const Icon = eligible ? ShieldCheck : ShieldAlert;
  return (
    <div
      className={`media-candidate-status${eligible ? " media-candidate-ready" : ""}`}
      role="status"
    >
      <Icon aria-hidden="true" size={18} />
      <div>
        <strong>{locale}发布候选{eligible ? "可用" : "受阻"}</strong>
        {!eligible ? <span>{issues[0]}</span> : null}
      </div>
    </div>
  );
}

function MetadataTextField({
  id,
  label,
  value,
  type = "text",
  required = false,
  invalid = false,
  disabled,
  maxLength,
  placeholder,
  multiline = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "url";
  required?: boolean;
  invalid?: boolean;
  disabled: boolean;
  maxLength: number;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field-group">
      <label htmlFor={id}>
        {label}
        {required ? <span className="required-field">必填</span> : null}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function purposeLabel(value: MediaPurpose) {
  return mediaPurposeOptions.find((option) => option.value === value)?.label ?? value;
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KiB`;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "图片操作失败。";
}

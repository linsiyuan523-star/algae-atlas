import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { ImageIntake } from "./ImageIntake";
import type { MediaApi, StagedImage } from "../media";

const staged: StagedImage = {
  formatVersion: 1,
  draftId: "11111111-1111-4111-8111-111111111111",
  id: "22222222-2222-4222-8222-222222222222",
  originalName: "fictional.png",
  stagedName: "22222222-2222-4222-8222-222222222222.png",
  targetPath:
    "public/images/uploads/2026/07/22222222-2222-4222-8222-222222222222.png",
  mimeType: "image/png",
  bytes: 4,
  width: 640,
  height: 480,
  sha256: "a".repeat(64),
  uploadedAt: "2026-07-24T08:00:00Z",
  purpose: "cover",
  metadata: {
    creatorOrProvider: "",
    sourceUrl: "",
    licenseIdentifier: "",
    licenseName: "",
    licenseUrl: "",
    attribution: "",
    usageScope: "internal-only",
    rightsStatus: "pending",
    identificationStatus: "not-applicable",
    identifiablePeople: false,
    consentState: "not-applicable",
    consentReference: "",
    altZh: "",
    altEn: "",
    captionZh: "",
    captionEn: "",
  },
};

function createApi(): MediaApi {
  return {
    stageImage: vi.fn(async (input) => ({
      ...staged,
      originalName: input.originalName,
      purpose: input.purpose,
      bytes: input.bytes.length,
    })),
    listImages: vi.fn(async () => []),
    saveMetadata: vi.fn(async (_draftId, _imageId, metadata) => ({
      ...staged,
      metadata,
    })),
  };
}

function Harness({ api }: { api: MediaApi }) {
  const [images, setImages] = useState<StagedImage[]>([]);
  return (
    <ImageIntake
      api={api}
      draftId={staged.draftId}
      contentType="team-news"
      images={images}
      englishEnabled={false}
      disabled={false}
      onStaged={(image) => setImages((current) => [...current, image])}
      onUpdated={(image) =>
        setImages((current) =>
          current.map((item) => (item.id === image.id ? image : item)),
        )
      }
      onInsertBody={vi.fn()}
    />
  );
}

test("selects an image, previews its UUID target, and saves rights metadata", async () => {
  const user = userEvent.setup();
  const api = createApi();
  render(<Harness api={api} />);

  await user.selectOptions(screen.getByLabelText("最大边长"), "1600");
  await user.selectOptions(screen.getByLabelText("输出上限"), String(1024 * 1024));
  await user.click(screen.getByLabelText("保留原图（仅本地）"));

  const file = new File([new Uint8Array([1, 2, 3, 4])], "fictional.png", {
    type: "image/png",
  });
  await user.upload(screen.getByLabelText("选择图片文件"), file);

  expect(api.stageImage).toHaveBeenCalledWith(
    expect.objectContaining({
      draftId: staged.draftId,
      originalName: "fictional.png",
      purpose: "cover",
      bytes: [1, 2, 3, 4],
      processing: {
        maxWidth: 1600,
        maxHeight: 1600,
        maxOutputBytes: 1024 * 1024,
        preserveOriginal: true,
      },
    }),
  );
  expect(await screen.findByText(staged.targetPath)).toBeVisible();
  expect(screen.getByText("中文发布候选受阻")).toBeVisible();

  await user.type(screen.getByLabelText(/作者或提供者/), "Fictional provider");
  await user.selectOptions(screen.getByLabelText("许可标识"), "permission-granted");
  await user.type(screen.getByLabelText(/许可名称/), "Fictional permission");
  await user.type(screen.getByLabelText(/署名文字/), "Fictional provider");
  await user.selectOptions(screen.getByLabelText("权利状态"), "approved");
  await user.selectOptions(screen.getByLabelText("使用范围"), "public-site");
  await user.type(screen.getByLabelText(/中文替代文字/), "虚构图片");

  expect(screen.getByText("中文发布候选可用")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "保存元数据" }));
  await waitFor(() => expect(api.saveMetadata).toHaveBeenCalledOnce());
  expect(api.saveMetadata).toHaveBeenCalledWith(
    staged.draftId,
    staged.id,
    expect.objectContaining({
      licenseIdentifier: "permission-granted",
      rightsStatus: "approved",
      usageScope: "public-site",
      altZh: "虚构图片",
    }),
  );
  expect(await screen.findByText("元数据已保存。")).toBeVisible();
});

test("accepts files dropped into the intake zone", async () => {
  const api = createApi();
  render(<Harness api={api} />);
  const file = new File([new Uint8Array([9, 8, 7])], "dropped.png", {
    type: "image/png",
  });

  fireEvent.drop(screen.getByRole("button", { name: "选择或拖放图片" }), {
    dataTransfer: { files: [file] },
  });

  await waitFor(() => expect(api.stageImage).toHaveBeenCalledOnce());
  expect(api.stageImage).toHaveBeenCalledWith(
    expect.objectContaining({ originalName: "dropped.png" }),
  );
});

import type { TaskControllerShared } from '../../types/tasks'
import { HttpError, sendAsClientError, sendBadRequest, sendControllerError, sendNotFound, sendOk, sendCreated } from '../../types/errors'
import type { ApiRequest, ApiResponse } from '../../types/http'
import { createMarksRepository } from '../../db/repositories/marks'
import { createMediaRepository } from '../../db/repositories/media'
import fs from 'fs'
import { downloadRemoteImage } from '../../services/remoteImageDownload'
import { resolveBundledPublicFile } from '../../utils/publicAssets'
import path from 'path'
import { resolveExistingPath } from '../../services/contentHash'
import { resolveActiveDbFilePath } from '../../services/mediaPathResolver'
import {
  buildVideoGridTaskParams,
  VIDEO_MARK_HEIGHT,
  VIDEO_MARK_JPEG_QUALITY,
} from '../../../shared/videoPreview'
import { upsertVisualHashForMedia } from '../../services/visualHashBackfill'
import { upsertClipEmbeddingForMedia } from '../../services/mediaClipEmbeddings'
import { formatMarkTimestamp } from '../../../shared/markTimestamp'
import { generateVideoGrid } from '../../services/videoGrid'
import { resolveMediaIdFromGridRequest } from '../../services/videoGridRequest'
import { isUsableVideoThumbFile } from '../../services/videoPreviewThumb'
import { isPathInside } from '../../utils/isPathInside'
import { buildPathLookupVariants } from '../../utils/normalizeUserPath'

export default function createTasksVideoPreviewController(shared: TaskControllerShared) {
  // Read dbPath per request: a destructured snapshot goes stale after a database switch.
  const {db, getDbPath, createThumbMiddle, createThumbCustom, getImageMedia} = shared
  const marksRepo = createMarksRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)

  const createThumbForVideo = async function (req: ApiRequest, res: ApiResponse) {
    const seekRatio = req.body.seekRatio != null ? Number(req.body.seekRatio) : 0.5
    // Source comes from the library row, never from a client-supplied path.
    const mediaId = Number(req.body.id)
    const media = mediaId ? mediaRepo.findById(mediaId) : undefined
    const resolvedInputPath = resolveActiveDbFilePath(media?.path, getDbPath())
    if (!resolvedInputPath) {
      sendBadRequest(res, 'The video does not exist.')
      return
    }

    createThumbMiddle(resolvedInputPath, req.body.id, seekRatio)
      .then((result: string) => {
        sendOk(res, result)
      })
      .catch((e: unknown) => {
        sendAsClientError(res, e, 'Failed to create video thumbnail')
      })
  }

  const createThumb = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const dbPath = getDbPath()
      const media = mediaRepo.findByPathVariants(buildPathLookupVariants(String(req.body.inputPath || '')))
      if (!media) {
        sendBadRequest(res, 'The video is not in the library.')
        return
      }

      const resolvedInputPath = resolveActiveDbFilePath(media.path, dbPath)
      if (!resolvedInputPath) {
        sendBadRequest(res, 'The video does not exist.')
        return
      }

      const outputPath = path.normalize(String(req.body.outputPath || ''))
      if (!outputPath) {
        sendBadRequest(res, 'No output path provided.')
        return
      }
      // createThumbCustom runs mkdir -p and replaces the target, so confine it first.
      if (!dbPath || !isPathInside(path.join(dbPath, 'media'), outputPath)) {
        sendBadRequest(res, 'Output path must be inside the database media folder.')
        return
      }

      const overwrite = req.body.overwrite !== false
      if (!overwrite) {
        const outputExists = await resolveExistingPath(outputPath)
        if (outputExists && isUsableVideoThumbFile(outputExists)) {
          sendBadRequest(res, 'The image already exists.')
          return
        }
      }

      await createThumbCustom(
        req.body.timestamp,
        resolvedInputPath,
        outputPath,
        req.body.width,
      )
      sendOk(res, outputPath)
    } catch (e) {
      sendAsClientError(res, e, 'Failed to create thumbnail')
    }
  }

  const createGrid = async function (req: ApiRequest, res: ApiResponse) {
    const dbPath = getDbPath()
    const gridsPath = path.join(dbPath ?? '', 'media', 'videos', 'grids')

    // The UI sends `${id}.jpg`; anything with a directory part would escape gridsPath.
    const output = String(req.body.output ?? '')
    if (path.basename(output) !== output || output === '..') {
      sendBadRequest(res, 'Invalid grid output name.')
      return
    }

    const mediaId = resolveMediaIdFromGridRequest(req.body)
    // Source comes from the library row; req.body.input is ignored.
    const input = mediaId ? resolveActiveDbFilePath(mediaRepo.findById(mediaId)?.path, dbPath) : null
    if (!input) {
      sendBadRequest(res, 'The video does not exist.')
      return
    }

    const gridPath = path.join(gridsPath, output)

    const ensureVisualHash = async (force = false) => {
      if (!mediaId) return
      try {
        if (!force) {
          const existing = mediaRepo.findById(mediaId)
          if (existing?.visualHash) return
        }
        await upsertVisualHashForMedia(db, mediaId)
      } catch {
        // Grid is usable; hash can be filled via Settings → visual hash backfill.
      }
    }

    const ensureClipEmbedding = async () => {
      if (!mediaId) return
      try {
        await upsertClipEmbeddingForMedia(db, mediaId)
      } catch {
        // Grid is usable; CLIP embedding can be filled via Settings backfill.
      }
    }

    if (!fs.existsSync(gridPath)) {
      try {
        const result = await generateVideoGrid({...req.body, input, output}, dbPath ?? '')
        if (result) {
          // Respond as soon as the sprite is on disk. Visual hash / CLIP can take
          // much longer (and block the ffmpeg queue for the next Review item).
          sendOk(res, result)
          void Promise.all([
            ensureVisualHash(true),
            ensureClipEmbedding(),
          ]).catch(() => undefined)
        } else {
          sendBadRequest(res, 'Unable to probe video duration')
        }
      } catch (err) {
        sendAsClientError(res, err, 'Failed to create video grid')
      }
    } else {
      // Small on-scroll batches often recreate/skip existing grids — still fill missing hashes.
      sendBadRequest(res, 'Grid already exists')
      void Promise.all([
        ensureVisualHash(false),
        ensureClipEmbedding(),
      ]).catch(() => undefined)
    }
  }

  const createTimeline = async function (req: ApiRequest, res: ApiResponse) {
    const resolvedVideoPath = await resolveExistingPath(req.body.path)
    if (!resolvedVideoPath) {
      sendBadRequest(res, 'The video does not exist.')
      return
    }

    req.body = {
      ...req.body,
      ...buildVideoGridTaskParams(resolvedVideoPath, `${req.body.id}.jpg`),
    }
    return createGrid(req, res)
  }

  const createImage = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const {url, sizes, image} = req.body
      const outputPath = path.normalize(String(req.body.outputPath || ''))
      // Tag/performer images live under meta/, media thumbs under media/. Never anywhere
      // else in the DB folder: db.sqlite or backups/ would be overwritten with a JPEG.
      const dbPath = getDbPath()
      if (
        !dbPath
        || !/\.(jpe?g|png|webp)$/i.test(outputPath)
        || !['media', 'meta'].some((folder) => isPathInside(path.join(dbPath, folder), outputPath))
      ) {
        sendBadRequest(res, 'Output path must be an image inside the media or meta folder.')
        return
      }
      const downloadUrl = url
        || (typeof image === 'string' && /^https?:\/\//i.test(image.trim()) ? image.trim() : null)
      let buf: Buffer

      if (downloadUrl) {
        buf = await downloadRemoteImage(downloadUrl)
      } else if (typeof image === 'string' && path.isAbsolute(image) && isPathInside(dbPath, image) && fs.existsSync(image)) {
        // Local sources are DB files only (face crops); anything else on disk stays unread.
        buf = await fs.promises.readFile(image)
      } else if (typeof image === 'string') {
        const bundled = resolveBundledPublicFile(image)
        if (bundled) {
          buf = await fs.promises.readFile(bundled)
        } else {
          buf = Buffer.from(req.body.image, 'base64')
        }
      } else {
        buf = Buffer.from(req.body.image, 'base64')
      }

      const result = await getImageMedia().processAndSaveImage({
        buffer: buf,
        outputPath,
        sizes,
      })
      sendCreated(res, {outputPath: result})
    } catch (e) {
      // Log the detail server-side only: echoing it back would be a port-scan oracle.
      console.log(e instanceof Error ? e.message : e)
      const message = 'Failed to download or save image'
      // Soft failure: UI treats 202 as non-fatal image save issues.
      sendControllerError(res, new HttpError(202, message), message)
    }
  }

  const createMarkThumbForMark = async function (req: ApiRequest, res: ApiResponse) {
    try {
      const markId = Number(req.body.markId)
      const mediaId = Number(req.body.mediaId)

      if (!markId || !mediaId) {
        sendBadRequest(res, 'markId and mediaId are required')
        return
      }

      const mark = marksRepo.findByIdAndMediaId(markId, mediaId)

      if (!mark) {
        sendNotFound(res, 'Mark not found')
        return
      }

      const media = mediaRepo.findById(mediaId)

      if (!media?.path) {
        sendNotFound(res, 'Media not found')
        return
      }

      const dbPath = getDbPath()
      const resolvedInputPath = resolveActiveDbFilePath(media.path, dbPath)
      if (!resolvedInputPath) {
        sendBadRequest(res, 'The video does not exist.')
        return
      }

      const marksDir = path.join(dbPath ?? '', 'media/videos/marks')
      if (!fs.existsSync(marksDir)) {
        fs.mkdirSync(marksDir, {recursive: true})
      }

      const outputPath = path.join(marksDir, `${markId}.jpg`)
      if (!req.body.overwrite && fs.existsSync(outputPath)) {
        sendBadRequest(res, 'The image already exists.')
        return
      }

      await createThumbCustom(
        formatMarkTimestamp(Number(mark.time)),
        resolvedInputPath,
        outputPath,
        VIDEO_MARK_HEIGHT,
        VIDEO_MARK_JPEG_QUALITY,
      )
      sendOk(res, 'success')
    } catch (e) {
      sendAsClientError(res, e, 'Failed to create mark thumbnail')
    }
  }

  return {
    createThumbForVideo,
    createThumb,
    createMarkThumbForMark,
    createGrid,
    createTimeline,
    createImage,
  }
}

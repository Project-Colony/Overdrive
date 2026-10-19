/**
 * @vitest-environment node
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiRequest, ApiResponse} from '../../types/http'

const {createThumbCustom, mediaRepo} = vi.hoisted(() => ({
  createThumbCustom: vi.fn(),
  mediaRepo: {
    findById: vi.fn(),
    findByPathVariants: vi.fn(),
  },
}))

vi.mock('../../db/repositories/marks', () => ({
  createMarksRepository: () => ({}),
}))

vi.mock('../../db/repositories/media', () => ({
  createMediaRepository: () => mediaRepo,
}))

vi.mock('../../services/contentHash', () => ({
  // Output path must not exist so createThumbCustom is reached.
  resolveExistingPath: vi.fn(async () => null),
}))

vi.mock('../../services/mediaPathResolver', () => ({
  resolveActiveDbFilePath: vi.fn(() => '/tmp/video.mp4'),
}))

vi.mock('../../services/videoPreviewThumb', () => ({
  isUsableVideoThumbFile: vi.fn(() => false),
}))

vi.mock('../../services/remoteImageDownload', () => ({
  downloadRemoteImage: vi.fn(),
}))

vi.mock('../../utils/publicAssets', () => ({
  resolveBundledPublicFile: vi.fn(),
}))

vi.mock('../../services/visualHashBackfill', () => ({
  upsertVisualHashForMedia: vi.fn(),
}))

vi.mock('../../services/mediaClipEmbeddings', () => ({
  upsertClipEmbeddingForMedia: vi.fn(),
}))

vi.mock('../../services/videoGrid', () => ({
  generateVideoGrid: vi.fn(),
}))

vi.mock('../../services/videoGridRequest', () => ({
  resolveMediaIdFromGridRequest: vi.fn(),
}))

import createTasksVideoPreviewController from './TasksVideoPreview.controller'
import {resolveActiveDbFilePath} from '../../services/mediaPathResolver'
import {downloadRemoteImage} from '../../services/remoteImageDownload'
import {generateVideoGrid} from '../../services/videoGrid'
import {resolveMediaIdFromGridRequest} from '../../services/videoGridRequest'

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(payload: unknown) {
      this.body = payload
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return res as typeof res & ApiResponse
}

function createController(overrides: Record<string, unknown> = {}) {
  return createTasksVideoPreviewController({
    db: {drizzle: {}} as never,
    getDbPath: () => '/tmp/db',
    createThumbMiddle: vi.fn(),
    createThumbCustom,
    getImageMedia: vi.fn(),
    ...overrides,
  } as never)
}

describe('TasksVideoPreviewController createThumb errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps thumbnail failures through sendControllerError', async () => {
    createThumbCustom.mockRejectedValueOnce(new Error('ffmpeg failed'))
    mediaRepo.findByPathVariants.mockReturnValueOnce({id: 1, path: '/tmp/video.mp4'})
    const controller = createController()

    const res = createResponse()
    await controller.createThumb(
      {
        body: {
          inputPath: '/tmp/video.mp4',
          outputPath: '/tmp/db/media/out.jpg',
          timestamp: '00:00:01',
          width: 320,
          overwrite: true,
        },
      } as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'ffmpeg failed'})
  })

  it('rejects createThumbForVideo when the source video cannot be resolved', async () => {
    vi.mocked(resolveActiveDbFilePath).mockReturnValueOnce(null)

    const controller = createController({createThumbCustom: vi.fn()})

    const res = createResponse()
    await controller.createThumbForVideo(
      {
        body: {
          path: '/missing/video.mp4',
          id: 1,
        },
      } as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({message: 'The video does not exist.'})
  })

  it('rejects createThumb outputs outside the database media folder', async () => {
    mediaRepo.findByPathVariants.mockReturnValueOnce({id: 1, path: '/tmp/video.mp4'})
    const controller = createController()

    const res = createResponse()
    await controller.createThumb(
      {body: {inputPath: '/tmp/video.mp4', outputPath: '/home/u/.ssh/authorized_keys', timestamp: 1, width: 320}} as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(createThumbCustom).not.toHaveBeenCalled()
  })

  it('rejects createThumb for a video that is not in the library', async () => {
    mediaRepo.findByPathVariants.mockReturnValueOnce(undefined)
    const controller = createController()

    const res = createResponse()
    await controller.createThumb(
      {body: {inputPath: '/etc/passwd', outputPath: '/tmp/db/media/out.jpg', timestamp: 1, width: 320}} as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(createThumbCustom).not.toHaveBeenCalled()
  })
})

describe('TasksVideoPreviewController createGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an output name with a directory part', async () => {
    const controller = createController()

    const res = createResponse()
    await controller.createGrid({body: {id: 1, input: '/tmp/video.mp4', output: '../x.jpg'}} as ApiRequest, res)

    expect(res.statusCode).toBe(400)
    expect(generateVideoGrid).not.toHaveBeenCalled()
  })

  it('reads the source video from the library row, not req.body.input', async () => {
    vi.mocked(resolveMediaIdFromGridRequest).mockReturnValueOnce(7)
    mediaRepo.findById.mockReturnValue({id: 7, path: '/library/clip.mp4'})
    const controller = createController()

    const res = createResponse()
    await controller.createGrid({body: {id: 7, input: '/etc/passwd', output: '7.jpg'}} as ApiRequest, res)

    expect(resolveActiveDbFilePath).toHaveBeenCalledWith('/library/clip.mp4', '/tmp/db')
    expect(generateVideoGrid).toHaveBeenCalledWith(
      expect.objectContaining({input: '/tmp/video.mp4', output: '7.jpg'}),
      '/tmp/db',
    )
  })
})

describe('TasksVideoPreviewController createImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects outputs outside the database folder without writing', async () => {
    const processAndSaveImage = vi.fn()
    const controller = createController({getImageMedia: () => ({processAndSaveImage})})

    const res = createResponse()
    await controller.createImage({body: {image: 'aGVsbG8=', outputPath: '/tmp/elsewhere/x.jpg'}} as ApiRequest, res)

    expect(res.statusCode).toBe(400)
    expect(processAndSaveImage).not.toHaveBeenCalled()
  })

  it('refuses DB files outside media/ and meta/, and non-image names', async () => {
    const processAndSaveImage = vi.fn()
    const controller = createController({getImageMedia: () => ({processAndSaveImage})})

    for (const outputPath of ['/tmp/db/db.sqlite', '/tmp/db/backups/b.zip', '/tmp/db/media.jpg', '/tmp/db/meta/1/x.sqlite']) {
      const res = createResponse()
      await controller.createImage({body: {image: 'aGVsbG8=', outputPath}} as ApiRequest, res)
      expect(res.statusCode, outputPath).toBe(400)
    }
    expect(processAndSaveImage).not.toHaveBeenCalled()
  })

  it('reads local sources only from the database folder', async () => {
    const processAndSaveImage = vi.fn().mockResolvedValue('/tmp/db/meta/1/2_main.jpg')
    const controller = createController({getImageMedia: () => ({processAndSaveImage})})

    const res = createResponse()
    await controller.createImage({body: {image: '/etc/hostname', outputPath: '/tmp/db/meta/1/2_main.jpg'}} as ApiRequest, res)

    // Not read from disk: the string falls through to the base64 decode.
    expect(processAndSaveImage).toHaveBeenCalledWith(expect.objectContaining({
      buffer: Buffer.from('/etc/hostname', 'base64'),
    }))
  })

  it('does not echo download errors back to the client', async () => {
    vi.mocked(downloadRemoteImage).mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:22'))
    const controller = createController()

    const res = createResponse()
    await controller.createImage(
      {body: {image: 'x', url: 'http://example.com/a.jpg', outputPath: '/tmp/db/meta/1/2_main.jpg'}} as ApiRequest,
      res,
    )

    expect(res.statusCode).toBe(202)
    expect(res.body).toEqual({message: 'Failed to download or save image'})
  })
})

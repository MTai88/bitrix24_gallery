<script setup lang="ts">
/**
 * FilePond-загрузчик фотографий.
 *
 * Файл уходит на сервер сразу при выборе (server.process), элемент
 * инфоблока создаётся в том же запросе (mtai:gallery.photo.upload) и
 * возвращается готовая карточка — emit('added'). Убрали файл из пруда —
 * mtai:gallery.photo.revert удаляет только что созданный элемент.
 *
 * Грабли FilePond 4.32.x, учтено здесь (как в mtai.bpservices):
 *  - server.process строго функцией: в конфиг-объекте onload приходит
 *    XHR-объект, а не текст ответа, и файл «зависает» на 100%;
 *  - у программного пруда fieldName пуст — имя multipart-части задаём
 *    жёстко ('file');
 *  - текст ошибки сервера показывает labelFileProcessingError-функция
 *    (err.body).
 */
import { computed, ref } from 'vue';
import vueFilePond from 'vue-filepond';
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import 'filepond/dist/filepond.min.css';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css';
import type { Photo } from '../js/types';
import type { Api } from '../js/api';

const FilePond = vueFilePond(FilePondPluginImageExifOrientation, FilePondPluginImagePreview);

const props = defineProps<{
  api: Api;
  albumId: number;
}>();

const emit = defineEmits<{
  added: [photo: Photo];
  removed: [id: number];
}>();

const pond = ref<any>(null);
const lastError = ref('');

const labels = {
  labelIdle: 'Перетащите фотографии или <span class="filepond--label-action">выберите</span>',
  labelInvalidField: 'Поле содержит файлы неподходящего типа',
  labelFileWaitingForSize: 'Определяем размер',
  labelFileSizeNotAvailable: 'Размер недоступен',
  labelFileLoading: 'Чтение файла',
  labelFileLoadError: 'Не удалось прочитать файл',
  labelFileProcessing: 'Загрузка…',
  labelFileProcessingComplete: 'Загружена',
  labelFileProcessingAborted: 'Отменена',
  labelFileProcessingError: (err: { body?: string }) => err?.body || 'Не удалось загрузить файл',
  labelTapToCancel: 'нажмите для отмены',
  labelTapToRetry: 'нажмите для повтора',
  labelTapToUndo: 'нажмите для отмены',
};

const server = computed(() => ({
  process: (
    fieldName: string,
    file: File,
    metadata: Record<string, unknown>,
    load: (serverId: string) => void,
    error: (message: string) => void,
    progress: (loaded: number, total: number) => void,
  ) => {
    const formData = new FormData();
    // fieldName у программного пруда пуст — часть должна называться 'file'
    formData.append('file', file, file.name || 'file');
    formData.append('sessid', props.api.sessid);
    formData.append('albumId', String(props.albumId));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', props.api.actionUrl('mtai:gallery.photo.upload'));
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        progress(e.loaded, e.total);
      }
    });
    xhr.addEventListener('load', () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // ответ не JSON — обработается ниже как ошибка
      }
      if (xhr.status < 200 || xhr.status >= 300 || !data || data.status !== 'success') {
        const message =
          data && Array.isArray(data.errors) && data.errors.length
            ? String(data.errors[0].message)
            : `HTTP ${xhr.status}`;
        lastError.value = message;
        error(message);
        return;
      }
      lastError.value = '';
      load(String(data.data.id));
      emit('added', data.data as Photo);
    });
    xhr.addEventListener('error', () => {
      lastError.value = 'Ошибка сети';
      error('Ошибка сети');
    });
    xhr.send(formData);

    return {
      abort: () => {
        xhr.abort();
      },
    };
  },
  revert: (uniqueFileId: string, load: () => void, error: (message: string) => void) => {
    const body = new URLSearchParams({ id: uniqueFileId, sessid: props.api.sessid });
    fetch(props.api.actionUrl('mtai:gallery.photo.revert'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'same-origin',
    })
      .then(() => {
        emit('removed', Number(uniqueFileId));
        load();
      })
      .catch(() => {
        error('Не удалось удалить файл');
      });
  },
}));
</script>

<template>
  <div class="mtai-uploader">
    <file-pond
      ref="pond"
      name="file"
      :allow-multiple="true"
      :max-parallel-uploads="3"
      :server="server"
      :label-idle="labels.labelIdle"
      :label-invalid-field="labels.labelInvalidField"
      :label-file-waiting-for-size="labels.labelFileWaitingForSize"
      :label-file-size-not-available="labels.labelFileSizeNotAvailable"
      :label-file-loading="labels.labelFileLoading"
      :label-file-load-error="labels.labelFileLoadError"
      :label-file-processing="labels.labelFileProcessing"
      :label-file-processing-complete="labels.labelFileProcessingComplete"
      :label-file-processing-aborted="labels.labelFileProcessingAborted"
      :label-file-processing-error="labels.labelFileProcessingError"
      :label-tap-to-cancel="labels.labelTapToCancel"
      :label-tap-to-retry="labels.labelTapToRetry"
      :label-tap-to-undo="labels.labelTapToUndo"
      :instant-upload="true"
    />
    <div
      v-if="lastError"
      class="mtai-uploader__error"
    >
      {{ lastError }}
    </div>
  </div>
</template>

<style scoped>
.mtai-uploader {
  margin-bottom: 8px;
}

.mtai-uploader__error {
  margin-top: 8px;
  color: #d9433e;
  font-size: 13px;
}
</style>

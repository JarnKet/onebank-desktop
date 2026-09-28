<script lang="ts">
    /**
     * Says, in the shell, that the screen on show was answered by the local
     * store rather than the bank (`src/lib/api/local`) — so nobody takes a
     * payment made here for one that left the account.
     *
     * In flow, never positioned: it pushes the page down rather than covering it.
     */
    import Icon from '@iconify/svelte';
    import {t} from '../utils/helper';
</script>

<div role="status"
     class="mb-4 flex items-start gap-3 rounded-ob-sm border border-onebank-blue/20 bg-onebank-blue-soft px-4 py-3 text-sm text-onebank-blue">
    <Icon icon="mdi:cloud-off-outline" class="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true"/>
    <p>
        <span class="font-semibold">{t('Offline data', 'ຂໍ້ມູນອອບລາຍ', '离线数据', 'Dữ liệu ngoại tuyến')}</span>
        — {t(
            'The bank did not answer, so this screen is working on data kept in this browser. Nothing here was sent to the bank.',
            'ທະນາຄານບໍ່ຕອບກັບ, ໜ້ານີ້ຈຶ່ງໃຊ້ຂໍ້ມູນທີ່ເກັບໄວ້ໃນບຣາວເຊີນີ້. ບໍ່ມີລາຍການໃດຖືກສົ່ງໄປຫາທະນາຄານ.',
            '银行未响应，此页面正在使用保存在本浏览器中的数据。此处的任何内容都未发送到银行。',
            'Ngân hàng không phản hồi nên màn hình này đang dùng dữ liệu lưu trong trình duyệt. Không có gì ở đây được gửi đến ngân hàng.',
        )}
    </p>
</div>

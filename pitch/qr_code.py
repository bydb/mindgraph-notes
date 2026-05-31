from PIL import Image, ImageDraw


def _gf_mul(x, y):
    z = 0
    while y:
        if y & 1:
            z ^= x
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
        y >>= 1
    return z


def _rs_generator(degree):
    result = [0] * degree
    result[-1] = 1
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = _gf_mul(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = _gf_mul(root, 0x02)
    return result


def _rs_remainder(data, degree):
    generator = _rs_generator(degree)
    result = [0] * degree
    for b in data:
        factor = b ^ result.pop(0)
        result.append(0)
        for i, coef in enumerate(generator):
            result[i] ^= _gf_mul(coef, factor)
    return result


def _format_bits(mask):
    # Error correction level L has format value 01.
    data = (1 << 3) | mask
    rem = data
    rem <<= 10
    poly = 0x537
    for i in range(14, 9, -1):
        if (rem >> i) & 1:
            rem ^= poly << (i - 10)
    return ((data << 10) | rem) ^ 0x5412


def _set_finder(modules, reserved, x, y):
    size = len(modules)
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            xx, yy = x + dx, y + dy
            if 0 <= xx < size and 0 <= yy < size:
                dist = max(abs(dx), abs(dy))
                modules[yy][xx] = dist <= 3 and dist != 2
                if dist <= 4:
                    reserved[yy][xx] = True


def _set_alignment(modules, reserved, x, y):
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            dist = max(abs(dx), abs(dy))
            modules[y + dy][x + dx] = dist != 1
            reserved[y + dy][x + dx] = True


def make_qr_matrix(text):
    # Fixed QR Code version 4-L: 33x33, 80 data codewords, 20 ECC codewords.
    version = 4
    size = version * 4 + 17
    data_capacity = 80
    ecc_len = 20

    payload = text.encode("utf-8")
    if len(payload) > 64:
        raise ValueError("Text is too long for this compact QR generator")

    bits = []
    def append(value, length):
        for i in range(length - 1, -1, -1):
            bits.append((value >> i) & 1)

    append(0b0100, 4)  # byte mode
    append(len(payload), 8)
    for b in payload:
        append(b, 8)
    for _ in range(min(4, data_capacity * 8 - len(bits))):
        bits.append(0)
    while len(bits) % 8:
        bits.append(0)

    data = []
    for i in range(0, len(bits), 8):
        value = 0
        for bit in bits[i:i + 8]:
            value = (value << 1) | bit
        data.append(value)
    pad = [0xEC, 0x11]
    i = 0
    while len(data) < data_capacity:
        data.append(pad[i % 2])
        i += 1

    codewords = data + _rs_remainder(data, ecc_len)
    stream = []
    for b in codewords:
        for i in range(7, -1, -1):
            stream.append((b >> i) & 1)

    modules = [[False] * size for _ in range(size)]
    reserved = [[False] * size for _ in range(size)]
    _set_finder(modules, reserved, 3, 3)
    _set_finder(modules, reserved, size - 4, 3)
    _set_finder(modules, reserved, 3, size - 4)

    for i in range(size):
        if not reserved[6][i]:
            modules[6][i] = i % 2 == 0
            reserved[6][i] = True
        if not reserved[i][6]:
            modules[i][6] = i % 2 == 0
            reserved[i][6] = True

    _set_alignment(modules, reserved, 26, 26)
    modules[4 * version + 9][8] = True
    reserved[4 * version + 9][8] = True

    for i in range(9):
        reserved[8][i] = True
        reserved[i][8] = True
    for i in range(8):
        reserved[8][size - 1 - i] = True
        reserved[size - 1 - i][8] = True

    bit_index = 0
    upward = True
    x = size - 1
    while x > 0:
        if x == 6:
            x -= 1
        for dy in range(size):
            y = size - 1 - dy if upward else dy
            for xx in (x, x - 1):
                if not reserved[y][xx] and bit_index < len(stream):
                    bit = bool(stream[bit_index])
                    if (xx + y) % 2 == 0:  # mask pattern 0
                        bit = not bit
                    modules[y][xx] = bit
                    bit_index += 1
        upward = not upward
        x -= 2

    fmt = _format_bits(0)
    def fmt_bit(i):
        return ((fmt >> i) & 1) != 0

    for i in range(6):
        modules[i][8] = fmt_bit(i)
        modules[8][i] = fmt_bit(i)
    modules[7][8] = fmt_bit(6)
    modules[8][8] = fmt_bit(7)
    modules[8][7] = fmt_bit(8)
    for i in range(9, 15):
        modules[8][14 - i] = fmt_bit(i)
    for i in range(8):
        modules[8][size - 1 - i] = fmt_bit(i)
    for i in range(8, 15):
        modules[size - 15 + i][8] = fmt_bit(i)

    return modules


def save_qr(text, out_path, scale=12, border=4, dark=(26, 26, 26), light=(255, 253, 248)):
    try:
        from reportlab.graphics.barcode import qr
        code = qr.QrCodeWidget(text, barLevel="M").qr
        code.make()
        matrix = [[code.isDark(y, x) for x in range(code.getModuleCount())] for y in range(code.getModuleCount())]
    except Exception:
        matrix = make_qr_matrix(text)
    n = len(matrix)
    img = Image.new("RGB", ((n + border * 2) * scale, (n + border * 2) * scale), light)
    draw = ImageDraw.Draw(img)
    for y, row in enumerate(matrix):
        for x, value in enumerate(row):
            if value:
                x1 = (x + border) * scale
                y1 = (y + border) * scale
                draw.rectangle((x1, y1, x1 + scale - 1, y1 + scale - 1), fill=dark)
    img.save(out_path)
    return img

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <png.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Read a PNG file and convert to ARGB CARDINAL array for _NET_WM_ICON */
static int read_png(const char *path, unsigned long **out_data, unsigned long *out_count) {
    FILE *fp = fopen(path, "rb");
    if (!fp) { fprintf(stderr, "Cannot open %s\n", path); return -1; }

    png_structp png = png_create_read_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    if (!png) { fclose(fp); return -1; }

    png_infop info = png_create_info_struct(png);
    if (!info) { png_destroy_read_struct(&png, NULL, NULL); fclose(fp); return -1; }

    if (setjmp(png_jmpbuf(png))) {
        png_destroy_read_struct(&png, &info, NULL);
        fclose(fp);
        return -1;
    }

    png_init_io(png, fp);
    png_read_info(png, info);

    int width = png_get_image_width(png, info);
    int height = png_get_image_height(png, info);
    png_byte color_type = png_get_color_type(png, info);
    png_byte bit_depth = png_get_bit_depth(png, info);

    /* Force RGBA 8-bit */
    if (bit_depth == 16) png_set_strip_16(png);
    if (color_type == PNG_COLOR_TYPE_PALETTE) png_set_palette_to_rgb(png);
    if (color_type == PNG_COLOR_TYPE_GRAY && bit_depth < 8) png_set_expand_gray_1_2_4_to_8(png);
    if (png_get_valid(png, info, PNG_INFO_tRNS)) png_set_tRNS_to_alpha(png);
    if (color_type == PNG_COLOR_TYPE_RGB || color_type == PNG_COLOR_TYPE_GRAY || color_type == PNG_COLOR_TYPE_PALETTE)
        png_set_filler(png, 0xff, PNG_FILLER_AFTER);
    if (color_type == PNG_COLOR_TYPE_GRAY || color_type == PNG_COLOR_TYPE_GRAY_ALPHA)
        png_set_gray_to_rgb(png);

    png_read_update_info(png, info);

    png_size_t rowbytes = png_get_rowbytes(png, info);
    png_bytep *rows = malloc(sizeof(png_bytep) * height);
    png_bytep data = malloc(rowbytes * height);
    for (int y = 0; y < height; y++)
        rows[y] = data + y * rowbytes;

    png_read_image(png, rows);

    /* Build _NET_WM_ICON data: width, height, then ARGB pixels */
    unsigned long count = 2 + (unsigned long)width * height;
    unsigned long *icon_data = malloc(count * sizeof(unsigned long));
    icon_data[0] = width;
    icon_data[1] = height;

    for (int y = 0; y < height; y++) {
        png_bytep row = rows[y];
        for (int x = 0; x < width; x++) {
            png_bytep px = row + x * 4;
            unsigned char r = px[0], g = px[1], b = px[2], a = px[3];
            /* ARGB: 0xAARRGGBB */
            icon_data[2 + y * width + x] = ((unsigned long)a << 24) | ((unsigned long)r << 16) | ((unsigned long)g << 8) | b;
        }
    }

    free(rows);
    free(data);
    png_destroy_read_struct(&png, &info, NULL);
    fclose(fp);

    *out_data = icon_data;
    *out_count = count;
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <window_id> <icon.png>\n", argv[0]);
        return 1;
    }

    Window win = (Window)strtol(argv[1], NULL, 0);

    unsigned long *icon_data;
    unsigned long count;
    if (read_png(argv[2], &icon_data, &count) < 0) return 1;

    fprintf(stderr, "Icon: %lux%lu, %lu values\n", icon_data[0], icon_data[1], count);

    Display *display = XOpenDisplay(NULL);
    if (!display) { fprintf(stderr, "Cannot open display\n"); free(icon_data); return 1; }

    Atom net_wm_icon = XInternAtom(display, "_NET_WM_ICON", False);
    XChangeProperty(display, win, net_wm_icon, XInternAtom(display, "CARDINAL", False), 32,
                    PropModeReplace, (unsigned char *)icon_data, count);
    XFlush(display);
    XCloseDisplay(display);

    free(icon_data);
    fprintf(stderr, "Set _NET_WM_ICON for window 0x%lx\n", win);
    return 0;
}

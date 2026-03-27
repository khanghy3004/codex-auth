const std = @import("std");

pub const Stdout = struct {
    buffered_writer: std.io.BufferedWriter(4096, std.fs.File.Writer),

    pub fn init(self: *Stdout) void {
        self.buffered_writer = std.io.bufferedWriter(std.io.getStdOut().writer());
    }

    pub fn out(self: *Stdout) std.io.AnyWriter {
        return .{
            .context = &self.buffered_writer,
            .writeFn = (struct {
                fn write(ptr: *const anyopaque, bytes: []const u8) anyerror!usize {
                    const bw: *std.io.BufferedWriter(4096, std.fs.File.Writer) = @constCast(@alignCast(@ptrCast(ptr)));
                    return bw.write(bytes);
                }
            }).write,
        };
    }

    pub fn flush(self: *Stdout) !void {
        try self.buffered_writer.flush();
    }
};

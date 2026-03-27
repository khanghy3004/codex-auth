const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const is_windows = target.result.os.tag == .windows;

    const exe = b.addExecutable(.{
        .name = "codex-auth-proxy",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    b.installArtifact(exe);

    if (is_windows) {
        const auto_exe = b.addExecutable(.{
            .name = "codex-auth-proxy-auto",
            .root_source_file = b.path("src/windows_auto_main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
        });
        auto_exe.subsystem = .Windows;
        b.installArtifact(auto_exe);
    }

    const run_cmd = b.addRunArtifact(exe);
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }
    const run_step = b.step("run", "Run codex-auth-proxy");
    run_step.dependOn(&run_cmd.step);

    const tests = b.addTest(.{
        .name = "codex-auth-proxy-test",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&tests.step);
}

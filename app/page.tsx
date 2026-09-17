import CameraCapture from "@/components/camera/camera-capture";
import VisionScoreTester from "@/components/vision/vision-score-tester";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-5 py-10">
      <h1 className="text-2xl font-bold">짤 따라하기</h1>
      <CameraCapture />
      <VisionScoreTester />
    </main>
  );
}

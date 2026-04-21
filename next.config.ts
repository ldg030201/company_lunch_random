import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js dev 서버는 기본적으로 localhost 외 origin에서 오는 dev-only
  // 에셋 요청을 차단함. 같은 WiFi의 다른 기기(예: 휴대폰, 동료 노트북)가
  // 이 Mac의 IP로 접속할 수 있도록 아래 origin들을 허용.
  allowedDevOrigins: [
    "192.168.0.*",
    "192.168.1.*",
    "10.*.*.*",
    "172.16.*.*",
    "*.local",
  ],
};

export default nextConfig;

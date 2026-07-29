"use client"

import { useState } from "react"
import { AlertCircle, ArrowLeft, CheckCircle2, Download, Loader2 } from "lucide-react"
import { useRouter } from "@/i18n/routing"
import { useQueryClient } from "@tanstack/react-query"
import { signContract } from "@/lib/modules/portal/actions"
import {
  getContractClauses,
  CONTRACT_VERSION,
  hasSignedMinimumContract,
} from "@/lib/modules/portal/contract-template"

interface ContractPageProps {
  brandSlug: string
  orgName: string
  currency: string
  basePay: number | null
  monthlyPayoutCap: number | null
  contractSigned: boolean
  contractSignerName: string | null
  contractSignedAt: string | null
  contractVersion: string | null
  embedded?: boolean
}

export function ContractPage({
  brandSlug,
  orgName,
  currency,
  basePay,
  contractSigned,
  contractSignerName,
  contractSignedAt,
  contractVersion,
  embedded,
  monthlyPayoutCap,
}: ContractPageProps) {
  const router = useRouter()

  const resolvedParams = {
    brandName: orgName,
    currency,
    baseFee: basePay != null ? basePay / 100 : null,
    monthlyPayoutCap: monthlyPayoutCap != null ? monthlyPayoutCap / 100 : null,
  }
  const clauses = getContractClauses(resolvedParams)

  const queryClient = useQueryClient()
  const [agreed, setAgreed] = useState(false)
  const [name, setName] = useState("")
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [signed, setSigned] = useState(
    contractSigned && hasSignedMinimumContract(contractVersion)
  )
  const [signerName, setSignerName] = useState(contractSignerName)
  const [signedAt, setSignedAt] = useState(contractSignedAt)
  const [version, setVersion] = useState(contractVersion)

  const handleSign = async () => {
    if (!agreed || !name.trim()) return
    setSigning(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("brandSlug", brandSlug)
      formData.append("signerName", name.trim())
      const result = await signContract({}, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setSigned(true)
      setSignerName(name.trim())
      setSignedAt(new Date().toISOString())
      setVersion(CONTRACT_VERSION)
      await queryClient.invalidateQueries({ queryKey: ['campaign-workspace', brandSlug] })
      router.refresh()
    } catch {
      setError("Failed to sign contract")
    } finally {
      setSigning(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { pdf } = await import("@react-pdf/renderer")
      const { ContractPDF } = await import("@/components/Portal/ContractPDF")
      const doc = (
        <ContractPDF
          brandName={orgName}
          clauses={clauses}
          signerName={signerName}
          signedAt={signedAt}
          version={version ?? CONTRACT_VERSION}
        />
      )
      const blob = await pdf(doc).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Creator_Agreement_${orgName.replace(/\s+/g, "_")}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError("Failed to generate PDF")
    } finally {
      setDownloading(false)
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className={embedded ? "flex flex-col items-center px-4 py-6 sm:px-6" : "flex min-h-screen flex-col items-center px-4 py-12 sm:px-6"}>
      <div className="w-full max-w-3xl">
        {!embedded && (
          <button
            type="button"
            onClick={() => router.push(`/dashboard/jobs/${brandSlug}`)}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        <div className={embedded ? "p-0" : "rounded-xl border bg-card p-8 shadow-sm sm:p-12"}>
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-lg font-bold uppercase tracking-widest">
            Creator Services Agreement
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Between <span className="font-medium text-foreground">8x Social, Inc.</span>{" "}
            (&ldquo;Company&rdquo;) on behalf of{" "}
            <span className="font-medium text-foreground">{orgName}</span>{" "}
            (&ldquo;Brand&rdquo;) and the undersigned Creator
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Effective date: {today}
          </p>
        </div>

        {/* Clauses */}
        <div className="space-y-8">
          {clauses.map((clause, i) => (
            <section key={i}>
              <h2 className="text-sm font-bold">{clause.title}</h2>
              {clause.paragraphs.map((p, j) => (
                <p
                  key={j}
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        {/* Signature block */}
        <div className="mt-12 border-t pt-8">
          {signed ? (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                    Agreement signed
                  </p>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                    Signed by{" "}
                    <span className="font-medium">{signerName}</span> on{" "}
                    {signedAt
                      ? new Date(signedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
                    Version {version}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2 rounded-lg border border-green-300 dark:border-green-800 px-4 py-2 text-sm font-medium text-green-800 dark:text-green-200 transition-colors hover:bg-green-100 dark:hover:bg-green-900/50 disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download PDF
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/30 p-6 space-y-5">
              {contractSigned && !hasSignedMinimumContract(contractVersion) && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Updated agreement
                    </p>
                    <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
                      You previously signed {contractVersion ? `v${contractVersion}` : "an older version"}
                      {contractSignedAt
                        ? ` on ${new Date(contractSignedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
                        : ""}
                      . Please review and sign v{CONTRACT_VERSION} to continue receiving payouts.
                    </p>
                  </div>
                </div>
              )}
              <h3 className="text-sm font-bold text-center">Sign this agreement</h3>

              <label className="flex items-start gap-3 cursor-pointer rounded-lg border bg-background p-4 transition-colors hover:bg-accent/30">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  I have read and agree to the terms of this Creator Services
                  Agreement.
                </span>
              </label>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Full legal name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-shadow"
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Date: {today}
                </p>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download PDF
                </button>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900 dark:text-red-100">Unable to sign contract</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSign}
                disabled={!agreed || !name.trim() || signing}
                className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {signing ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Sign Agreement"
                )}
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

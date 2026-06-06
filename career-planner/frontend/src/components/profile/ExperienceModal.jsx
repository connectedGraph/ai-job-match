import React, { useState } from 'react';
import { X } from 'lucide-react';
import { EXP_TAG_PRESETS, EXP_TYPE_NAMES } from '../../constants';

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white";
const labelClass = "block text-xs font-bold text-gray-600 mb-1.5";
const textareaClass = `${inputClass} min-h-[96px] resize-y`;

const uniqueTags = (tags) => [...new Set((tags || []).map((tag) => String(tag || "").trim()).filter(Boolean))];

const createInitialForm = (type, item = {}) => ({
  companyName: item.companyName || "",
  positionName: item.positionName || "",
  projectName: item.projectName || "",
  roleName: item.roleName || "",
  competitionName: item.competitionName || "",
  award: item.award || "",
  labName: item.labName || "",
  direction: item.direction || "",
  orgName: item.orgName || "",
  position: item.position || "",
  duty: item.duty || "",
  learningType: item.type || "self_study",
  skill: item.skill || "",
  semester: item.semester || "",
  jobDesc: item.jobDesc || "",
  notes: item.notes || "",
  certName: item.name || "",
  certLevel: item.level || "",
  certNote: item.note || "",
  startDate: type === "competition" || type === "certificates" ? item.date || item.startDate || "" : item.startDate || "",
  endDate: item.endDate === "至今" ? "" : item.endDate || "",
  isCurrent: item.endDate === "至今",
  tags: uniqueTags(item.tags),
  customTag: "",
});

const Field = ({ label, children }) => (
  <div>
    <label className={labelClass}>{label}</label>
    {children}
  </div>
);

const ExperienceModal = ({ type, item, index, open, onClose, onSave }) => {
  const [form, setForm] = useState(() => createInitialForm(type, item));
  const presets = EXP_TAG_PRESETS[type] || [];
  const title = `${index === null || index === undefined ? "添加" : "编辑"}${EXP_TYPE_NAMES[type] || "经历"}`;

  if (!open) return null;

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleTag = (tag) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
    }));
  };

  const addCustomTag = () => {
    const tag = form.customTag.trim();
    if (!tag) return;
    setForm((prev) => ({
      ...prev,
      customTag: "",
      tags: uniqueTags([...prev.tags, tag]),
    }));
  };

  const removeTag = (tag) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((item) => item !== tag) }));
  };

  const toPayload = () => {
    const tags = uniqueTags(form.tags);
    const base = {
      startDate: form.startDate.trim(),
      endDate: form.isCurrent ? "至今" : form.endDate.trim(),
      tags,
    };

    switch (type) {
      case "internship":
        return {
          ...base,
          companyName: form.companyName.trim(),
          positionName: form.positionName.trim(),
          jobDesc: form.jobDesc.trim(),
        };
      case "projects":
        return {
          ...base,
          projectName: form.projectName.trim(),
          roleName: form.roleName.trim(),
          jobDesc: form.jobDesc.trim(),
        };
      case "competition":
        return {
          competitionName: form.competitionName.trim(),
          award: form.award.trim(),
          roleName: form.roleName.trim(),
          date: form.startDate.trim(),
          startDate: "",
          endDate: "",
          tags,
        };
      case "research":
        return {
          ...base,
          labName: form.labName.trim(),
          direction: form.direction.trim(),
          roleName: form.roleName.trim(),
        };
      case "campus":
        return {
          ...base,
          orgName: form.orgName.trim(),
          position: form.position.trim(),
          duty: form.duty.trim(),
        };
      case "learning":
        return {
          ...base,
          type: form.learningType,
          skill: form.skill.trim(),
          semester: form.semester,
          notes: form.notes.trim(),
        };
      case "certificates":
        return {
          name: form.certName.trim(),
          level: form.certLevel.trim(),
          note: form.certNote.trim(),
          date: form.startDate.trim(),
          tags,
        };
      default:
        return base;
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(toPayload());
  };

  const renderTypeFields = () => {
    switch (type) {
      case "internship":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="公司名称">
                <input className={inputClass} value={form.companyName} onChange={(event) => update("companyName", event.target.value)} />
              </Field>
              <Field label="职位名称">
                <input className={inputClass} value={form.positionName} onChange={(event) => update("positionName", event.target.value)} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label="工作描述">
                <textarea className={textareaClass} value={form.jobDesc} onChange={(event) => update("jobDesc", event.target.value)} />
              </Field>
            </div>
          </>
        );
      case "projects":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="项目名称">
                <input className={inputClass} value={form.projectName} onChange={(event) => update("projectName", event.target.value)} />
              </Field>
              <Field label="担任角色">
                <input className={inputClass} value={form.roleName} onChange={(event) => update("roleName", event.target.value)} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label="项目描述">
                <textarea className={textareaClass} value={form.jobDesc} onChange={(event) => update("jobDesc", event.target.value)} />
              </Field>
            </div>
          </>
        );
      case "competition":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="竞赛名称">
                <input className={inputClass} value={form.competitionName} onChange={(event) => update("competitionName", event.target.value)} />
              </Field>
              <Field label="获得奖项">
                <input className={inputClass} value={form.award} onChange={(event) => update("award", event.target.value)} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label="参赛角色">
                <input className={inputClass} value={form.roleName} onChange={(event) => update("roleName", event.target.value)} />
              </Field>
            </div>
          </>
        );
      case "research":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="实验室名称">
                <input className={inputClass} value={form.labName} onChange={(event) => update("labName", event.target.value)} />
              </Field>
              <Field label="担任角色">
                <input className={inputClass} value={form.roleName} onChange={(event) => update("roleName", event.target.value)} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label="研究方向">
                <input className={inputClass} value={form.direction} onChange={(event) => update("direction", event.target.value)} />
              </Field>
            </div>
          </>
        );
      case "campus":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="组织名称">
                <input className={inputClass} value={form.orgName} onChange={(event) => update("orgName", event.target.value)} />
              </Field>
              <Field label="担任职务">
                <input className={inputClass} value={form.position} onChange={(event) => update("position", event.target.value)} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label="主要职责">
                <textarea className={textareaClass} value={form.duty} onChange={(event) => update("duty", event.target.value)} />
              </Field>
            </div>
          </>
        );
      case "learning":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="技能 / 课程名称">
                <input className={inputClass} value={form.skill} onChange={(event) => update("skill", event.target.value)} />
              </Field>
              <Field label="学习类型">
                <select className={inputClass} value={form.learningType} onChange={(event) => update("learningType", event.target.value)}>
                  <option value="self_study">自主学习</option>
                  <option value="course">课程学习</option>
                  <option value="self_study_with_project">实战学习</option>
                </select>
              </Field>
            </div>
            <div className="mb-4">
              <Field label="学期">
                <select className={inputClass} value={form.semester} onChange={(event) => update("semester", event.target.value)}>
                  <option value="">-- 留空 --</option>
                  {["大一上", "大一下", "大二上", "大二下", "大三上", "大三下", "大四上", "大四下"].map((semester) => (
                    <option key={semester} value={semester}>{semester}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mb-4">
              <Field label="学习内容">
                <textarea className={textareaClass} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
              </Field>
            </div>
          </>
        );
      case "certificates":
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="证书名称">
                <input className={inputClass} value={form.certName} onChange={(event) => update("certName", event.target.value)} />
              </Field>
              <Field label="级别">
                <input className={inputClass} value={form.certLevel} onChange={(event) => update("certLevel", event.target.value)} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label="备注">
                <input className={inputClass} value={form.certNote} onChange={(event) => update("certNote", event.target.value)} />
              </Field>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const customTags = form.tags.filter((tag) => !presets.includes(tag));

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-black text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {renderTypeFields()}

        {type !== "certificates" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Field label={type === "competition" ? "比赛时间" : "开始时间"}>
              <input type="month" className={inputClass} value={form.startDate} onChange={(event) => update("startDate", event.target.value)} />
            </Field>
            {type !== "competition" && (
              <Field label="结束时间">
                <div className="flex gap-2">
                  <input
                    type="month"
                    className={`${inputClass} flex-grow`}
                    value={form.endDate}
                    disabled={form.isCurrent}
                    onChange={(event) => update("endDate", event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => update("isCurrent", !form.isCurrent)}
                    className={`flex-shrink-0 px-3 py-2 text-xs rounded-lg border font-bold transition-colors ${
                      form.isCurrent ? "bg-primary text-white border-primary" : "bg-white text-gray-500 border-gray-300"
                    }`}
                  >
                    至今
                  </button>
                </div>
              </Field>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <Field label="获得日期">
              <input type="month" className={inputClass} value={form.startDate} onChange={(event) => update("startDate", event.target.value)} />
            </Field>
          </div>
        )}

        <div className="mb-6">
          <label className={labelClass}>标签</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {presets.map((tag) => {
              const active = form.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    active ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-300 hover:border-primary hover:text-primary"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            className={inputClass}
            placeholder="自定义标签，回车添加"
            value={form.customTag}
            onChange={(event) => update("customTag", event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addCustomTag();
            }}
          />
          {customTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {customTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-primary border border-blue-200 flex items-center gap-1"
                >
                  {tag}
                  <X size={12} className="text-blue-300" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50">
            取消
          </button>
          <button type="submit" className="flex-[2] py-2.5 bg-primary text-white rounded-xl text-sm font-black hover:bg-blue-700 shadow-lg shadow-blue-200">
            保存
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExperienceModal;

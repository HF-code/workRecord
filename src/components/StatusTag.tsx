import { Tag } from 'antd';
import { STATUS_COLORS, type Status } from '../types';

interface Props {
  status: Status;
}

export default function StatusTag({ status }: Props) {
  return <Tag color={STATUS_COLORS[status]}>{status}</Tag>;
}
